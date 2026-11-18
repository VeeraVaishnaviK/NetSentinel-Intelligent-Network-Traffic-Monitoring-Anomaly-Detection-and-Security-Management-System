"""
Clearly Labelled DEMO MODE Service.

Rule 17 compliance: Realistic synthetic demonstration data is ONLY created when
the user explicitly activates DEMO MODE, is strictly tagged with `is_demo = 1`,
and is cleanly removed when DEMO MODE is turned off without touching real records.
"""

import random
from datetime import datetime, timedelta, timezone

from app.database import get_all_settings, get_connection, set_setting, utc_now_iso
from app.services import network_service, security_service


def is_demo_mode() -> bool:
    return bool(get_all_settings().get("demo_mode", False))


def disable_demo_mode() -> dict:
    """Disable DEMO MODE and remove all synthetic `is_demo = 1` records."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM captured_packets WHERE is_demo = 1")
        conn.execute("DELETE FROM traffic_statistics WHERE is_demo = 1")
        conn.execute("DELETE FROM security_alerts WHERE is_demo = 1")
        conn.execute("DELETE FROM monitoring_sessions WHERE is_demo = 1")
        conn.execute("DELETE FROM devices WHERE is_demo = 1")
        conn.commit()
    finally:
        conn.close()
    set_setting("demo_mode", "false")
    return {"demo_mode": False, "message": "DEMO MODE disabled and demo records removed."}


def enable_demo_mode() -> dict:
    """Enable clearly labelled DEMO MODE and populate realistic tagged demo data."""
    disable_demo_mode()
    set_setting("demo_mode", "true")

    now = datetime.now(timezone.utc)
    pref = network_service.get_preferred_interface()
    iface_name = pref["name"] if pref else "Wi-Fi (Demo)"

    conn = get_connection()
    try:
        # 1. Demo monitoring session
        started_iso = (now - timedelta(minutes=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
        cur = conn.execute(
            """
            INSERT INTO monitoring_sessions (interface_name, started_at, status, packets_captured, is_demo)
            VALUES (?, ?, 'stopped', 180, 1)
            """,
            (iface_name, started_iso),
        )
        session_id = cur.lastrowid

        # 2. Demo local LAN devices
        demo_devices = [
            ("192.168.1.1", "A4:2B:8C:10:01:01", "gateway.local", "online", 0, 18_420_000, 32_150_000, 14500),
            ("192.168.1.15", "DC:A6:32:44:12:9F", "workstation-admin.local", "online", 0, 11_240_000, 24_890_000, 9820),
            ("192.168.1.24", "F0:18:98:77:21:4B", "dev-laptop.local", "online", 0, 6_540_000, 14_320_000, 6120),
            ("192.168.1.42", "B8:27:EB:55:89:C3", "lab-raspberrypi.local", "online", 0, 2_890_000, 4_120_000, 3240),
            ("192.168.1.78", "6C:40:08:91:33:E0", "smart-tv-living.local", "online", 0, 1_120_000, 18_950_000, 7430),
            ("192.168.1.105", "00:1A:2B:99:7E:11", "unknown-tablet.local", "online", 1, 940_000, 1_230_000, 890),
            ("192.168.1.132", "3C:5A:B4:61:44:2A", "printer-office.local", "offline", 0, 310_000, 480_000, 410),
        ]
        for idx, (ip, mac, host, status, is_new, b_sent, b_recv, pkts) in enumerate(demo_devices):
            first_seen = (now - timedelta(hours=6 - min(idx, 5))).strftime("%Y-%m-%dT%H:%M:%SZ")
            last_seen = (now - timedelta(minutes=0 if status == "online" else 42)).strftime("%Y-%m-%dT%H:%M:%SZ")
            conn.execute(
                """
                INSERT OR IGNORE INTO devices
                (ip_address, mac_address, hostname, interface_name, status, is_new,
                 bytes_sent, bytes_received, packet_count, first_discovered, last_seen, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (ip, mac, host, iface_name, status, is_new, b_sent, b_recv, pkts, first_seen, last_seen),
            )

        # 3. Demo Traffic History (last 30 points over 15 minutes)
        cum_recv = 52_000_000
        cum_sent = 21_000_000
        for i in range(30):
            ts = (now - timedelta(seconds=(29 - i) * 30)).strftime("%Y-%m-%dT%H:%M:%SZ")
            dl_bps = random.uniform(45_000, 420_000) if i != 24 else 5_850_000.0
            ul_bps = random.uniform(12_000, 130_000)
            recv_d = int(dl_bps * 2.5)
            sent_d = int(ul_bps * 2.5)
            cum_recv += recv_d
            cum_sent += sent_d
            pps = round((recv_d + sent_d) / 850.0, 2)
            conn.execute(
                """
                INSERT INTO traffic_statistics
                (session_id, interface_name, timestamp, bytes_recv, bytes_sent,
                 bytes_recv_delta, bytes_sent_delta, download_bps, upload_bps,
                 packets_recv, packets_sent, packets_per_sec, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (session_id, iface_name, ts, cum_recv, cum_sent, recv_d, sent_d, round(dl_bps, 2), round(ul_bps, 2), 1200 + i * 40, 800 + i * 25, pps),
            )

        # 4. Demo Captured Packets (safe metadata only — no payload decryption claims)
        sample_specs = [
            ("TCP", "192.168.1.15", "142.250.190.78", 52412, 443, "PA", "", "", "outbound"),
            ("TCP", "142.250.190.78", "192.168.1.15", 443, 52412, "A", "", "", "inbound"),
            ("DNS", "192.168.1.24", "8.8.8.8", 58120, 53, "", "api.github.com", "", "outbound"),
            ("DNS", "192.168.1.15", "1.1.1.1", 61022, 53, "", "docs.python.org", "", "outbound"),
            ("UDP", "192.168.1.78", "172.217.16.206", 51432, 443, "", "", "", "outbound"),
            ("HTTP", "192.168.1.42", "93.184.216.34", 49112, 80, "PA", "", "GET /status HTTP/1.1", "outbound"),
            ("ICMP", "192.168.1.15", "192.168.1.1", None, None, "", "", "", "local"),
            ("TCP", "192.168.1.105", "192.168.1.42", 54200, 22, "S", "", "", "local"),
            ("TCP", "192.168.1.24", "140.82.121.4", 55091, 443, "PA", "", "", "outbound"),
            ("DNS", "192.168.1.42", "192.168.1.1", 53210, 53, "", "ntp.ubuntu.com", "", "local"),
        ]
        for i in range(120):
            proto, src, dst, sp, dp, flags, dns_q, http_i, direction = random.choice(sample_specs)
            ts = (now - timedelta(seconds=(120 - i) * 3)).strftime("%Y-%m-%dT%H:%M:%SZ")
            length = random.randint(60, 1480) if proto in ("TCP", "UDP", "HTTP") else random.randint(64, 168)
            sp_val = (sp + (i % 17)) if sp else None
            summary = (
                f"[DEMO] DNS query {dns_q} ({src} -> {dst})"
                if proto == "DNS"
                else (
                    f"[DEMO] HTTP {http_i} ({src}:{sp_val} -> {dst}:{dp})"
                    if proto == "HTTP"
                    else f"[DEMO] {proto} {src}{f':{sp_val}' if sp_val else ''} -> {dst}{f':{dp}' if dp else ''} {f'[{flags}] ' if flags else ''}Len={length}"
                )
            )
            conn.execute(
                """
                INSERT INTO captured_packets
                (session_id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol,
                 length, tcp_flags, dns_query, http_info, summary, direction, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (session_id, ts, src, dst, sp_val, dp, proto, length, flags, dns_q, http_i, summary, direction),
            )

        conn.commit()
    finally:
        conn.close()

    # 5. Demo Security Alerts (clearly flagged is_demo=True)
    security_service.create_alert(
        rule_type="port_scan",
        title="Potential Port Scan Activity Detected (Demo)",
        severity="High",
        src_ip="192.168.1.105",
        dst_ip="192.168.1.42",
        reason="[DEMO MODE] Source 192.168.1.105 contacted 16 distinct destination ports on 192.168.1.42 within 45s (threshold: 10).",
        recommended_action="Verify whether host 192.168.1.105 is running an authorized service discovery tool or vulnerability assessment.",
        details={"distinct_ports_count": 16, "sample_ports": [21, 22, 23, 25, 53, 80, 110, 139, 443, 445, 3306, 8080]},
        is_demo=True,
        bypass_cooldown=True,
    )
    security_service.create_alert(
        rule_type="repeated_connection",
        title="Repeated SSH Connection Attempts (Demo)",
        severity="Medium",
        src_ip="192.168.1.105",
        dst_ip="192.168.1.42",
        reason="[DEMO MODE] Source 192.168.1.105 initiated 24 TCP SYN attempts to 192.168.1.42:22 within 60s (threshold: 20).",
        recommended_action="Inspect SSH authentication logs on 192.168.1.42 and confirm whether automated retries are expected.",
        details={"dst_port": 22, "attempts": 24, "protocol": "TCP"},
        is_demo=True,
        bypass_cooldown=True,
    )
    security_service.create_alert(
        rule_type="traffic_spike",
        title="Bandwidth Traffic Spike Detected (Demo)",
        severity="Medium",
        src_ip=iface_name,
        dst_ip="",
        reason=f"[DEMO MODE] Interface '{iface_name}' reached 5,712.9 KB/s combined throughput, exceeding the 5,000 KB/s baseline.",
        recommended_action="Review top bandwidth consumers on the Traffic Analytics page to confirm legitimate transfer activity.",
        details={"total_kbps": 5712.9, "threshold_kbps": 5000},
        is_demo=True,
        bypass_cooldown=True,
    )
    security_service.create_alert(
        rule_type="unknown_device",
        title="Unapproved Local Network Device Detected (Demo)",
        severity="Low",
        src_ip="192.168.1.105",
        dst_ip="",
        reason="[DEMO MODE] Discovered device 192.168.1.105 (MAC: 00:1A:2B:99:7E:11) is not present in the Trusted Devices registry.",
        recommended_action="Confirm ownership of the device and mark it as Trusted if authorized.",
        details={"ip_address": "192.168.1.105", "mac_address": "00:1A:2B:99:7E:11"},
        is_demo=True,
        bypass_cooldown=True,
    )

    return {
        "demo_mode": True,
        "message": "DEMO MODE enabled with clearly labelled synthetic datasets for demonstration.",
    }

