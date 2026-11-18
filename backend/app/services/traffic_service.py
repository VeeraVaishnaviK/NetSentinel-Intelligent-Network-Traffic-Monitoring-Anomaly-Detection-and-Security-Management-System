"""
Network Traffic Analytics & Interface Counter Sampler Service.

Uses psutil to collect real interface-level byte and packet counters at a
steady interval (every ~2.5s) and clearly distinguishes interface-level OS
counters from packet-level captured metadata.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

import psutil

from app.database import (
    enforce_retention_limits,
    get_all_settings,
    get_connection,
    utc_now_iso,
)
from app.services import network_service, packet_service, security_service

_sampler_lock = threading.Lock()
_sampler_started = False
_prev_sample = {}  # iface_name -> {bytes_recv, bytes_sent, packets_recv, packets_sent, ts}
_latest_snapshot = {
    "interface": "",
    "timestamp": None,
    "bytes_recv_total": 0,
    "bytes_sent_total": 0,
    "download_bps": 0.0,
    "upload_bps": 0.0,
    "packets_recv_total": 0,
    "packets_sent_total": 0,
    "packets_per_sec": 0.0,
}

RANGE_TO_MINUTES = {
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "24h": 1440,
}


def sample_interface_once(interface_name: str = "") -> dict | None:
    """Take a single real psutil sample for the chosen interface and record to SQLite."""
    if not interface_name:
        pref = network_service.get_preferred_interface()
        if not pref:
            return None
        interface_name = pref["name"]

    counters = psutil.net_io_counters(pernic=True)
    io = counters.get(interface_name)
    if io is None:
        return None

    now_epoch = time.time()
    now_iso = utc_now_iso()

    with _sampler_lock:
        prev = _prev_sample.get(interface_name)
        if prev is not None and (now_epoch - prev["ts"]) > 0.1:
            dt = now_epoch - prev["ts"]
            recv_delta = max(0, io.bytes_recv - prev["bytes_recv"])
            sent_delta = max(0, io.bytes_sent - prev["bytes_sent"])
            pkt_delta = max(0, (io.packets_recv - prev["packets_recv"]) + (io.packets_sent - prev["packets_sent"]))
            download_bps = round(recv_delta / dt, 2)
            upload_bps = round(sent_delta / dt, 2)
            pps = round(pkt_delta / dt, 2)
        else:
            recv_delta = 0
            sent_delta = 0
            download_bps = 0.0
            upload_bps = 0.0
            pps = 0.0

        _prev_sample[interface_name] = {
            "bytes_recv": io.bytes_recv,
            "bytes_sent": io.bytes_sent,
            "packets_recv": io.packets_recv,
            "packets_sent": io.packets_sent,
            "ts": now_epoch,
        }

        _latest_snapshot.update({
            "interface": interface_name,
            "timestamp": now_iso,
            "bytes_recv_total": io.bytes_recv,
            "bytes_sent_total": io.bytes_sent,
            "download_bps": download_bps,
            "upload_bps": upload_bps,
            "packets_recv_total": io.packets_recv,
            "packets_sent_total": io.packets_sent,
            "packets_per_sec": pps,
        })

    cap_status = packet_service.get_capture_status()
    session_id = cap_status.get("session_id") if cap_status.get("capturing") else None

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO traffic_statistics
            (session_id, interface_name, timestamp, bytes_recv, bytes_sent,
             bytes_recv_delta, bytes_sent_delta, download_bps, upload_bps,
             packets_recv, packets_sent, packets_per_sec, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                session_id,
                interface_name,
                now_iso,
                io.bytes_recv,
                io.bytes_sent,
                recv_delta,
                sent_delta,
                download_bps,
                upload_bps,
                io.packets_recv,
                io.packets_sent,
                pps,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    # Evaluate Security Rule 3 (Traffic Spike)
    if download_bps > 0 or upload_bps > 0:
        security_service.evaluate_traffic_spike(interface_name, download_bps, upload_bps, is_demo=False)

    return dict(_latest_snapshot)


def _sampler_loop():
    tick = 0
    while True:
        try:
            settings = get_all_settings()
            iface = settings.get("default_interface", "")
            sample_interface_once(iface)
            tick += 1
            if tick % 120 == 0:
                enforce_retention_limits()
        except Exception:
            pass
        time.sleep(2.5)


def start_background_sampler() -> None:
    """Start the single lightweight daemon thread sampling real psutil interface metrics."""
    global _sampler_started
    with _sampler_lock:
        if _sampler_started:
            return
        _sampler_started = True

    t = threading.Thread(target=_sampler_loop, daemon=True)
    t.start()


def get_current_traffic(interface_name: str = "") -> dict:
    """
    Return current traffic snapshot, explicitly separating:
    - interface_metrics: OS-level cumulative & rate counters from psutil
    - captured_packet_metrics: packet-level metadata from Scapy capture
    """
    settings = get_all_settings()
    demo_mode = settings.get("demo_mode", False)

    if interface_name and interface_name != _latest_snapshot.get("interface"):
        sample_interface_once(interface_name)
    elif not _latest_snapshot.get("timestamp"):
        sample_interface_once(settings.get("default_interface", ""))

    pkt_stats = packet_service.get_packet_stats(include_demo=demo_mode)

    with _sampler_lock:
        iface_snap = dict(_latest_snapshot)

    # Compute active interface speed for utilization %
    interfaces = network_service.list_interfaces()
    link_speed_mbps = 0
    for iface in interfaces:
        if iface["name"] == iface_snap["interface"]:
            link_speed_mbps = iface.get("speed_mbps", 0) or 0
            break

    total_bps = iface_snap["download_bps"] + iface_snap["upload_bps"]
    link_capacity_bps = (link_speed_mbps * 1_000_000) / 8.0 if link_speed_mbps > 0 else 0
    utilization_pct = (
        min(100.0, round((total_bps / link_capacity_bps) * 100, 3))
        if link_capacity_bps > 0
        else 0.0
    )

    return {
        "interface": iface_snap["interface"],
        "timestamp": iface_snap["timestamp"],
        "demo_mode": demo_mode,
        "interface_metrics": {
            "source": "psutil OS interface counters",
            "bytes_recv_total": iface_snap["bytes_recv_total"],
            "bytes_sent_total": iface_snap["bytes_sent_total"],
            "download_bps": iface_snap["download_bps"],
            "upload_bps": iface_snap["upload_bps"],
            "packets_recv_total": iface_snap["packets_recv_total"],
            "packets_sent_total": iface_snap["packets_sent_total"],
            "packets_per_sec": iface_snap["packets_per_sec"],
            "link_speed_mbps": link_speed_mbps,
            "utilization_percent": utilization_pct,
        },
        "captured_packet_metrics": {
            "source": "Scapy packet capture metadata" if not demo_mode else "Captured + Demo Mode packet metadata",
            "total_packets": pkt_stats["total_packets"],
            "total_bytes": pkt_stats["total_bytes"],
            "capture_pps": pkt_stats["capture_status"].get("packets_per_second", 0.0),
            "capturing": pkt_stats["capture_status"].get("capturing", False),
        },
    }


def get_traffic_history(range_key: str = "15m", interface_name: str = "") -> dict:
    """Return time-series interface traffic records for 5m, 15m, 1h, or 24h."""
    minutes = RANGE_TO_MINUTES.get(range_key, 15)
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
    settings = get_all_settings()
    demo_mode = settings.get("demo_mode", False)

    if not interface_name:
        interface_name = _latest_snapshot.get("interface") or settings.get("default_interface", "")

    conn = get_connection()
    try:
        where = ["timestamp >= ?"]
        params = [cutoff_iso]
        if not demo_mode:
            where.append("is_demo = 0")
            if interface_name:
                where.append("interface_name = ?")
                params.append(interface_name)
        else:
            # In demo mode, include demo records plus current interface records
            if interface_name:
                where.append("(interface_name = ? OR is_demo = 1)")
                params.append(interface_name)

        rows = conn.execute(
            f"""
            SELECT timestamp, interface_name, download_bps, upload_bps,
                   bytes_recv_delta, bytes_sent_delta, packets_per_sec, is_demo
            FROM traffic_statistics
            WHERE {' AND '.join(where)}
            ORDER BY timestamp ASC
            LIMIT 300
            """,
            params,
        ).fetchall()

        series = [
            {
                "timestamp": r["timestamp"],
                "interface_name": r["interface_name"],
                "download_kbps": round(r["download_bps"] / 1024.0, 2),
                "upload_kbps": round(r["upload_bps"] / 1024.0, 2),
                "download_bps": r["download_bps"],
                "upload_bps": r["upload_bps"],
                "bytes_recv_delta": r["bytes_recv_delta"],
                "bytes_sent_delta": r["bytes_sent_delta"],
                "packets_per_sec": r["packets_per_sec"],
                "is_demo": bool(r["is_demo"]),
            }
            for r in rows
        ]

        return {
            "range": range_key if range_key in RANGE_TO_MINUTES else "15m",
            "interface": interface_name,
            "points": series,
            "count": len(series),
        }
    finally:
        conn.close()


def get_protocol_and_device_analytics() -> dict:
    """Return protocol distribution and device-wise traffic breakdown."""
    settings = get_all_settings()
    demo_mode = settings.get("demo_mode", False)
    pkt_stats = packet_service.get_packet_stats(include_demo=demo_mode)
    devices = network_service.list_devices(include_demo=demo_mode)

    device_traffic = sorted(
        [
            {
                "ip_address": d["ip_address"],
                "hostname": d["hostname"] or d["ip_address"],
                "mac_address": d["mac_address"],
                "bytes_sent": d["bytes_sent"],
                "bytes_received": d["bytes_received"],
                "total_bytes": d["total_bytes"],
                "packet_count": d["packet_count"],
                "status": d["status"],
                "is_trusted": d["is_trusted"],
            }
            for d in devices
        ],
        key=lambda x: x["total_bytes"],
        reverse=True,
    )[:10]

    # Core protocol comparison (TCP vs UDP vs ICMP vs DNS vs HTTP vs OTHER)
    proto_map = {p["protocol"]: p for p in pkt_stats["protocols"]}
    core_protocols = []
    for name in ("TCP", "UDP", "ICMP", "DNS", "HTTP", "ARP", "OTHER"):
        if name in proto_map:
            core_protocols.append(proto_map[name])

    return {
        "protocols": pkt_stats["protocols"],
        "core_protocols": core_protocols,
        "total_captured_packets": pkt_stats["total_packets"],
        "total_captured_bytes": pkt_stats["total_bytes"],
        "top_devices": device_traffic,
        "top_sources": pkt_stats["top_sources"],
        "top_destinations": pkt_stats["top_destinations"],
        "note": "Protocol and device-wise traffic figures are derived from captured packet metadata, separate from OS interface byte counters.",
    }

