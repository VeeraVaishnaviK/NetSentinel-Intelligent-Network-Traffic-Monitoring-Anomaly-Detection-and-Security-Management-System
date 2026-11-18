"""
Live Packet Capture & Metadata Analysis Service.

Uses Scapy to capture live network packets after verifying system permissions
(Administrator/root + Npcap on Windows). Extracts safe packet metadata only
(no raw payloads, no HTTPS decryption claims) and enforces capture & retention limits.
"""

import threading
import time
from collections import deque

from app.database import (
    enforce_retention_limits,
    get_all_settings,
    get_connection,
    utc_now_iso,
)
from app.models.schemas import serialize_packet
from app.services import network_service, security_service
from app.utils.permissions import get_capture_capabilities

_capture_lock = threading.Lock()
_stop_event = threading.Event()
_capture_thread: threading.Thread | None = None
_recent_timestamps = deque(maxlen=500)

_state = {
    "capturing": False,
    "interface": "",
    "local_ip": "",
    "session_id": None,
    "started_at": None,
    "packets_captured_session": 0,
    "capture_limit": 5000,
    "last_error": None,
    "limit_reached": False,
}

HTTP_METHODS = (b"GET ", b"POST ", b"PUT ", b"DELETE ", b"HEAD ", b"OPTIONS ", b"PATCH ", b"HTTP/1.")


def _extract_http_metadata(raw_bytes: bytes) -> str:
    """Safely extract ONLY the first cleartext HTTP request/status line if visibly plaintext ASCII."""
    if not raw_bytes:
        return ""
    head = raw_bytes[:160]
    if not any(head.startswith(m) for m in HTTP_METHODS):
        return ""
    try:
        line = head.split(b"\r\n", 1)[0].decode("ascii", errors="ignore").strip()
        # Keep only printable ASCII characters and cap length
        clean = "".join(ch for ch in line if 32 <= ord(ch) < 127)
        return clean[:120]
    except Exception:
        return ""


def _parse_scapy_packet(pkt, local_ip: str = "") -> dict | None:
    """Extract safe Layer-3 / Layer-4 / DNS / visible HTTP metadata from a Scapy packet."""
    try:
        from scapy.layers.dns import DNS, DNSQR
        from scapy.layers.inet import ICMP, IP, TCP, UDP
        from scapy.layers.inet6 import IPv6
        from scapy.layers.l2 import ARP
        from scapy.packet import Raw
    except Exception:
        return None

    timestamp = utc_now_iso()
    length = len(pkt)
    src_ip = ""
    dst_ip = ""
    src_port = None
    dst_port = None
    protocol = "OTHER"
    tcp_flags = ""
    dns_query = ""
    http_info = ""

    if pkt.haslayer(IP):
        ip_layer = pkt[IP]
        src_ip = ip_layer.src
        dst_ip = ip_layer.dst
    elif pkt.haslayer(IPv6):
        ip6 = pkt[IPv6]
        src_ip = ip6.src
        dst_ip = ip6.dst
    elif pkt.haslayer(ARP):
        arp = pkt[ARP]
        src_ip = arp.psrc
        dst_ip = arp.pdst
        protocol = "ARP"
        summary = f"ARP {'who-has' if arp.op == 1 else 'is-at'} {dst_ip} from {src_ip}"
        return {
            "timestamp": timestamp,
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "src_port": None,
            "dst_port": None,
            "protocol": protocol,
            "length": length,
            "tcp_flags": "",
            "dns_query": "",
            "http_info": "",
            "summary": summary,
            "direction": "local",
        }
    else:
        return None

    if pkt.haslayer(TCP):
        tcp = pkt[TCP]
        src_port = int(tcp.sport)
        dst_port = int(tcp.dport)
        tcp_flags = str(tcp.flags)
        protocol = "TCP"

        if pkt.haslayer(Raw) and (src_port in (80, 8080, 8000) or dst_port in (80, 8080, 8000)):
            http_info = _extract_http_metadata(bytes(pkt[Raw].load))
            if http_info:
                protocol = "HTTP"
    elif pkt.haslayer(UDP):
        udp = pkt[UDP]
        src_port = int(udp.sport)
        dst_port = int(udp.dport)
        protocol = "UDP"
        if pkt.haslayer(DNS):
            protocol = "DNS"
            dns = pkt[DNS]
            if dns.qd and pkt.haslayer(DNSQR):
                try:
                    qname = pkt[DNSQR].qname
                    dns_query = qname.decode("utf-8", errors="ignore").rstrip(".")
                except Exception:
                    dns_query = ""
    elif pkt.haslayer(ICMP):
        protocol = "ICMP"

    direction = "local"
    if local_ip:
        if src_ip == local_ip:
            direction = "outbound"
        elif dst_ip == local_ip:
            direction = "inbound"

    if protocol == "DNS" and dns_query:
        summary = f"DNS query/response for {dns_query} ({src_ip} -> {dst_ip})"
    elif protocol == "HTTP" and http_info:
        summary = f"HTTP {http_info} ({src_ip}:{src_port} -> {dst_ip}:{dst_port})"
    elif protocol == "TCP":
        summary = f"TCP {src_ip}:{src_port} -> {dst_ip}:{dst_port} [{tcp_flags}] Len={length}"
    elif protocol == "UDP":
        summary = f"UDP {src_ip}:{src_port} -> {dst_ip}:{dst_port} Len={length}"
    elif protocol == "ICMP":
        summary = f"ICMP {src_ip} -> {dst_ip} Len={length}"
    else:
        summary = f"{protocol} {src_ip} -> {dst_ip} Len={length}"

    return {
        "timestamp": timestamp,
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "src_port": src_port,
        "dst_port": dst_port,
        "protocol": protocol,
        "length": length,
        "tcp_flags": tcp_flags,
        "dns_query": dns_query,
        "http_info": http_info,
        "summary": summary,
        "direction": direction,
    }


def _store_packet(session_id: int, meta: dict, is_demo: bool = False) -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO captured_packets
            (session_id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol,
             length, tcp_flags, dns_query, http_info, summary, direction, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                meta["timestamp"],
                meta["src_ip"],
                meta["dst_ip"],
                meta["src_port"],
                meta["dst_port"],
                meta["protocol"],
                meta["length"],
                meta["tcp_flags"],
                meta["dns_query"],
                meta["http_info"],
                meta["summary"],
                meta["direction"],
                1 if is_demo else 0,
            ),
        )
        conn.execute(
            "UPDATE monitoring_sessions SET packets_captured = packets_captured + 1 WHERE id = ?",
            (session_id,),
        )
        # Update device byte/packet statistics if src_ip or dst_ip matches a discovered device
        if meta["src_ip"]:
            conn.execute(
                """
                UPDATE devices
                SET bytes_sent = bytes_sent + ?, packet_count = packet_count + 1, last_seen = ?
                WHERE ip_address = ?
                """,
                (meta["length"], meta["timestamp"], meta["src_ip"]),
            )
        if meta["dst_ip"]:
            conn.execute(
                """
                UPDATE devices
                SET bytes_received = bytes_received + ?, packet_count = packet_count + 1, last_seen = ?
                WHERE ip_address = ?
                """,
                (meta["length"], meta["timestamp"], meta["dst_ip"]),
            )
        conn.commit()
    finally:
        conn.close()


def _capture_worker(interface_name: str, local_ip: str, session_id: int, capture_limit: int):
    from scapy.all import sniff

    def handle_packet(pkt):
        if _stop_event.is_set():
            return
        with _capture_lock:
            if _state["packets_captured_session"] >= capture_limit:
                _state["limit_reached"] = True
                _stop_event.set()
                return

        meta = _parse_scapy_packet(pkt, local_ip)
        if not meta:
            return

        _store_packet(session_id, meta, is_demo=False)
        _recent_timestamps.append(time.time())
        security_service.evaluate_packet(meta, is_demo=False)

        with _capture_lock:
            _state["packets_captured_session"] += 1
            count = _state["packets_captured_session"]
            if count >= capture_limit:
                _state["limit_reached"] = True
                _stop_event.set()

        if count % 250 == 0:
            enforce_retention_limits()

    try:
        while not _stop_event.is_set():
            kwargs = {
                "prn": handle_packet,
                "store": False,
                "timeout": 1,
                "stop_filter": lambda _: _stop_event.is_set(),
            }
            if interface_name:
                kwargs["iface"] = interface_name
            sniff(**kwargs)
    except Exception as exc:
        with _capture_lock:
            _state["last_error"] = f"Packet capture stopped due to error: {exc}"
    finally:
        _close_session(session_id)
        with _capture_lock:
            _state["capturing"] = False


def _close_session(session_id: int | None):
    if not session_id:
        return
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE monitoring_sessions
            SET status = 'stopped', ended_at = COALESCE(ended_at, ?)
            WHERE id = ? AND status = 'active'
            """,
            (utc_now_iso(), session_id),
        )
        conn.commit()
    finally:
        conn.close()


def start_capture(interface_name: str = "") -> tuple[dict, str | None, int]:
    """
    Start live packet capture after strictly validating Administrator + Npcap capabilities.
    Returns (status_dict, error_message_or_none, http_status_code).
    """
    caps = get_capture_capabilities()
    if not caps["can_live_capture"]:
        return (
            {
                "capabilities": caps,
                "capturing": False,
            },
            f"Live packet capture is unavailable: {caps['summary']} "
            f"You can enable clearly-labelled DEMO MODE in Settings or the top bar for academic demonstration.",
            403,
        )

    interfaces = network_service.list_interfaces()
    selected = None
    if interface_name:
        for iface in interfaces:
            if iface["name"] == interface_name:
                selected = iface
                break
        if selected is None:
            return {}, f"Interface '{interface_name}' not found.", 400
    else:
        selected = network_service.get_preferred_interface()
        if not selected:
            return {}, "No network interface available for packet capture.", 400

    settings = get_all_settings()
    capture_limit = max(100, int(settings.get("packet_capture_limit", 5000)))

    with _capture_lock:
        if _state["capturing"]:
            return get_capture_status(), None, 200

        conn = get_connection()
        now = utc_now_iso()
        try:
            cur = conn.execute(
                """
                INSERT INTO monitoring_sessions (interface_name, started_at, status, packets_captured, is_demo)
                VALUES (?, ?, 'active', 0, 0)
                """,
                (selected["name"], now),
            )
            session_id = cur.lastrowid
            conn.commit()
        finally:
            conn.close()

        _stop_event.clear()
        _recent_timestamps.clear()
        _state.update({
            "capturing": True,
            "interface": selected["name"],
            "local_ip": selected.get("ipv4", ""),
            "session_id": session_id,
            "started_at": now,
            "packets_captured_session": 0,
            "capture_limit": capture_limit,
            "last_error": None,
            "limit_reached": False,
        })

        global _capture_thread
        _capture_thread = threading.Thread(
            target=_capture_worker,
            args=(selected["name"], selected.get("ipv4", ""), session_id, capture_limit),
            daemon=True,
        )
        _capture_thread.start()

    return get_capture_status(), None, 200


def stop_capture() -> dict:
    _stop_event.set()
    with _capture_lock:
        session_id = _state["session_id"]
        _state["capturing"] = False
    _close_session(session_id)
    enforce_retention_limits()
    return get_capture_status()


def get_capture_status() -> dict:
    now = time.time()
    recent_10s = sum(1 for ts in list(_recent_timestamps) if now - ts <= 10.0)
    pps = round(recent_10s / 10.0, 2) if _state["capturing"] else 0.0

    with _capture_lock:
        return {
            **dict(_state),
            "packets_per_second": pps,
            "capabilities": get_capture_capabilities(),
        }


def query_packets(
    protocol: str = None,
    ip: str = None,
    src_ip: str = None,
    dst_ip: str = None,
    port: int = None,
    limit: int = 100,
    offset: int = 0,
    include_demo: bool = None,
) -> dict:
    settings = get_all_settings()
    if include_demo is None:
        include_demo = settings.get("demo_mode", False)

    conn = get_connection()
    try:
        where = ["1=1"]
        params = []
        if not include_demo:
            where.append("is_demo = 0")
        if protocol and protocol.upper() != "ALL":
            where.append("UPPER(protocol) = ?")
            params.append(protocol.upper())
        if ip:
            where.append("(src_ip LIKE ? OR dst_ip LIKE ?)")
            like = f"%{ip.strip()}%"
            params.extend([like, like])
        if src_ip:
            where.append("src_ip LIKE ?")
            params.append(f"%{src_ip.strip()}%")
        if dst_ip:
            where.append("dst_ip LIKE ?")
            params.append(f"%{dst_ip.strip()}%")
        if port is not None:
            where.append("(src_port = ? OR dst_port = ?)")
            params.extend([port, port])

        where_sql = " AND ".join(where)
        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM captured_packets WHERE {where_sql}", params
        ).fetchone()["cnt"]

        safe_limit = min(max(1, int(limit)), 500)
        safe_offset = max(0, int(offset))
        rows = conn.execute(
            f"""
            SELECT * FROM captured_packets
            WHERE {where_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            params + [safe_limit, safe_offset],
        ).fetchall()

        return {
            "packets": [serialize_packet(r) for r in rows],
            "total": total,
            "limit": safe_limit,
            "offset": safe_offset,
            "capture_status": get_capture_status(),
        }
    finally:
        conn.close()


def get_packet_stats(include_demo: bool = None) -> dict:
    settings = get_all_settings()
    if include_demo is None:
        include_demo = settings.get("demo_mode", False)

    demo_clause = "" if include_demo else "WHERE is_demo = 0"
    conn = get_connection()
    try:
        totals = conn.execute(
            f"SELECT COUNT(*) as total_packets, COALESCE(SUM(length), 0) as total_bytes FROM captured_packets {demo_clause}"
        ).fetchone()

        proto_rows = conn.execute(
            f"""
            SELECT protocol, COUNT(*) as count, COALESCE(SUM(length), 0) as bytes
            FROM captured_packets
            {demo_clause}
            GROUP BY protocol
            ORDER BY count DESC
            """
        ).fetchall()

        top_src_rows = conn.execute(
            f"""
            SELECT src_ip as ip, COUNT(*) as packets, COALESCE(SUM(length), 0) as bytes
            FROM captured_packets
            {demo_clause} {"AND" if demo_clause else "WHERE"} src_ip != ''
            GROUP BY src_ip
            ORDER BY bytes DESC
            LIMIT 8
            """
        ).fetchall()

        top_dst_rows = conn.execute(
            f"""
            SELECT dst_ip as ip, COUNT(*) as packets, COALESCE(SUM(length), 0) as bytes
            FROM captured_packets
            {demo_clause} {"AND" if demo_clause else "WHERE"} dst_ip != ''
            GROUP BY dst_ip
            ORDER BY bytes DESC
            LIMIT 8
            """
        ).fetchall()

        total_packets = totals["total_packets"]
        protocols = [
            {
                "protocol": r["protocol"],
                "count": r["count"],
                "bytes": r["bytes"],
                "percentage": round((r["count"] / total_packets) * 100, 1) if total_packets > 0 else 0.0,
            }
            for r in proto_rows
        ]

        return {
            "total_packets": total_packets,
            "total_bytes": totals["total_bytes"],
            "protocols": protocols,
            "top_sources": [dict(r) for r in top_src_rows],
            "top_destinations": [dict(r) for r in top_dst_rows],
            "capture_status": get_capture_status(),
        }
    finally:
        conn.close()

