"""
Rule-based Network Anomaly Detection Service (Security Center).

Implements 5 configurable, explainable detection rules without requiring ML:
1. Port scan indicator
2. Repeated connection attempts
3. Traffic spike
4. Unknown / unapproved device
5. Unusual traffic patterns

NOTE: Alerts indicate suspicious behaviour that warrants review and are NOT
definitive proof of malicious activity.
"""

import json
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from app.database import get_all_settings, get_connection, set_setting, utc_now_iso
from app.models.schemas import serialize_alert

_lock = threading.Lock()

# In-memory sliding windows for real-time packet rule evaluation
# port_history[src_ip] = deque of (timestamp_epoch, dst_ip, dst_port)
_port_history = defaultdict(lambda: deque(maxlen=2000))
# conn_history[(src_ip, dst_ip, dst_port)] = deque of timestamp_epoch
_conn_history = defaultdict(lambda: deque(maxlen=1000))
# icmp_history[src_ip] = deque of timestamp_epoch
_icmp_history = defaultdict(lambda: deque(maxlen=1000))
# uncommon_port_history[src_ip] = deque of timestamp_epoch
_uncommon_port_history = defaultdict(lambda: deque(maxlen=1000))

# Deduplication tracker: (rule_type, src_ip, dst_ip) -> last_alert_epoch
_recent_alert_cooldown = {}
ALERT_COOLDOWN_SECONDS = 30

COMMON_PORTS = {
    20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 110, 123, 135, 137, 138, 139,
    143, 161, 162, 389, 443, 445, 465, 514, 587, 636, 993, 995, 1433, 1521,
    1900, 3000, 3306, 3389, 5000, 5173, 5353, 5432, 5900, 6379, 8000, 8080, 8443
}

VALID_SEVERITIES = ("Critical", "High", "Medium", "Low")
VALID_STATUSES = ("open", "acknowledged", "resolved")


def _generate_alert_code(rule_type: str) -> str:
    prefix_map = {
        "port_scan": "PS",
        "repeated_connection": "RC",
        "traffic_spike": "TS",
        "unknown_device": "UD",
        "unusual_traffic": "UT",
    }
    prefix = prefix_map.get(rule_type, "AL")
    ts_part = datetime.now(timezone.utc).strftime("%H%M%S")
    millis = int((time.time() % 1) * 1000)
    return f"NS-{prefix}-{ts_part}{millis:03d}"


def get_rules() -> dict:
    """Return current configurable detection rules."""
    settings = get_all_settings()
    return settings.get("security_rules", {})


def update_rules(new_rules: dict) -> dict:
    """Merge and persist updated rule configurations."""
    current = get_rules()
    for rule_key, updates in new_rules.items():
        if rule_key not in current or not isinstance(updates, dict):
            continue
        for field, val in updates.items():
            if field in ("enabled",):
                current[rule_key][field] = bool(val)
            elif field == "severity" and val in VALID_SEVERITIES:
                current[rule_key][field] = val
            elif field in (
                "distinct_ports_threshold",
                "time_window_seconds",
                "attempts_threshold",
                "threshold_kbps",
                "icmp_threshold",
                "uncommon_port_threshold",
            ):
                try:
                    num = int(val)
                    if num > 0:
                        current[rule_key][field] = num
                except (ValueError, TypeError):
                    pass
    set_setting("security_rules", current)
    return current


def create_alert(
    rule_type: str,
    title: str,
    severity: str,
    reason: str,
    recommended_action: str,
    src_ip: str = "",
    dst_ip: str = "",
    details: dict = None,
    is_demo: bool = False,
    bypass_cooldown: bool = False,
) -> dict | None:
    """Create and persist a security alert, respecting deduplication cooldown."""
    now_epoch = time.time()
    cooldown_key = (rule_type, src_ip or "", dst_ip or "")
    with _lock:
        if not bypass_cooldown:
            last = _recent_alert_cooldown.get(cooldown_key, 0)
            if now_epoch - last < ALERT_COOLDOWN_SECONDS:
                return None
        _recent_alert_cooldown[cooldown_key] = now_epoch

    if severity not in VALID_SEVERITIES:
        severity = "Medium"

    alert_code = _generate_alert_code(rule_type)
    detected_at = utc_now_iso()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO security_alerts
            (alert_code, rule_type, title, severity, src_ip, dst_ip, detected_at,
             reason, recommended_action, status, details_json, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
            """,
            (
                alert_code,
                rule_type,
                title,
                severity,
                src_ip or "",
                dst_ip or "",
                detected_at,
                reason,
                recommended_action,
                json.dumps(details or {}),
                1 if is_demo else 0,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM security_alerts WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return serialize_alert(row)
    finally:
        conn.close()


def evaluate_packet(packet_meta: dict, is_demo: bool = False) -> list[dict]:
    """
    Evaluate a captured packet's metadata against packet-based security rules:
    - Port scan indicator
    - Repeated connection attempts
    - Unusual traffic patterns
    """
    rules = get_rules()
    triggered = []
    now = time.time()

    src_ip = packet_meta.get("src_ip") or ""
    dst_ip = packet_meta.get("dst_ip") or ""
    dst_port = packet_meta.get("dst_port")
    protocol = (packet_meta.get("protocol") or "").upper()
    tcp_flags = (packet_meta.get("tcp_flags") or "").upper()

    if not src_ip:
        return triggered

    # 1. Port Scan Indicator
    ps_rule = rules.get("port_scan", {})
    if ps_rule.get("enabled") and dst_port is not None and protocol in ("TCP", "UDP", "HTTP", "DNS"):
        window = int(ps_rule.get("time_window_seconds", 60))
        threshold = int(ps_rule.get("distinct_ports_threshold", 10))
        with _lock:
            dq = _port_history[src_ip]
            dq.append((now, dst_ip, dst_port))
            cutoff = now - window
            while dq and dq[0][0] < cutoff:
                dq.popleft()
            distinct_ports = {item[2] for item in dq}
            targets = list({item[1] for item in dq if item[1]})

        if len(distinct_ports) >= threshold:
            alert = create_alert(
                rule_type="port_scan",
                title="Potential Port Scan Activity Detected",
                severity=ps_rule.get("severity", "High"),
                src_ip=src_ip,
                dst_ip=dst_ip,
                reason=(
                    f"Source {src_ip} contacted {len(distinct_ports)} distinct destination ports "
                    f"within {window}s (threshold: {threshold}). Indicator of potential port scanning; "
                    f"verify whether this host is running an authorized scanner or service discovery."
                ),
                recommended_action=(
                    "Verify the identity and purpose of the source host. Check if an authorized network scan, "
                    "browser/P2P app, or misconfigured service is running."
                ),
                details={
                    "distinct_ports_count": len(distinct_ports),
                    "sample_ports": sorted(list(distinct_ports))[:20],
                    "targets": targets[:10],
                    "window_seconds": window,
                    "threshold": threshold,
                },
                is_demo=is_demo,
            )
            if alert:
                triggered.append(alert)

    # 2. Repeated Connection Attempts
    rc_rule = rules.get("repeated_connection", {})
    if rc_rule.get("enabled") and dst_ip and dst_port is not None:
        is_attempt = (protocol == "TCP" and "S" in tcp_flags and "A" not in tcp_flags) or protocol in ("TCP", "UDP")
        if is_attempt:
            window = int(rc_rule.get("time_window_seconds", 60))
            threshold = int(rc_rule.get("attempts_threshold", 20))
            key = (src_ip, dst_ip, dst_port)
            with _lock:
                dq = _conn_history[key]
                dq.append(now)
                cutoff = now - window
                while dq and dq[0] < cutoff:
                    dq.popleft()
                attempt_count = len(dq)

            if attempt_count >= threshold:
                alert = create_alert(
                    rule_type="repeated_connection",
                    title="Repeated Connection Attempts to Same Destination",
                    severity=rc_rule.get("severity", "Medium"),
                    src_ip=src_ip,
                    dst_ip=dst_ip,
                    reason=(
                        f"Source {src_ip} generated {attempt_count} rapid connection attempts to "
                        f"{dst_ip}:{dst_port} within {window}s (threshold: {threshold}). "
                        f"This may indicate retry loops, misconfigured software, or brute-force probing."
                    ),
                    recommended_action=(
                        "Inspect the destination service logs on the target host and confirm whether "
                        "the source client is retrying a failed connection or performing automated probing."
                    ),
                    details={
                        "dst_port": dst_port,
                        "attempts": attempt_count,
                        "window_seconds": window,
                        "threshold": threshold,
                        "protocol": protocol,
                    },
                    is_demo=is_demo,
                )
                if alert:
                    triggered.append(alert)

    # 5. Unusual Traffic Patterns (ICMP flood/burst or high uncommon-port burst)
    ut_rule = rules.get("unusual_traffic", {})
    if ut_rule.get("enabled"):
        window = int(ut_rule.get("time_window_seconds", 60))
        if protocol == "ICMP":
            icmp_threshold = int(ut_rule.get("icmp_threshold", 30))
            with _lock:
                dq = _icmp_history[src_ip]
                dq.append(now)
                cutoff = now - window
                while dq and dq[0] < cutoff:
                    dq.popleft()
                count = len(dq)
            if count >= icmp_threshold:
                alert = create_alert(
                    rule_type="unusual_traffic",
                    title="Unusual ICMP Traffic Volume",
                    severity=ut_rule.get("severity", "Medium"),
                    src_ip=src_ip,
                    dst_ip=dst_ip,
                    reason=(
                        f"Source {src_ip} generated {count} ICMP packets within {window}s "
                        f"(threshold: {icmp_threshold}). May indicate ping sweep, diagnostics, or ICMP flood testing."
                    ),
                    recommended_action=(
                        "Confirm whether network diagnostics (ping/traceroute) are currently running from this host."
                    ),
                    details={
                        "icmp_count": count,
                        "window_seconds": window,
                        "threshold": icmp_threshold,
                    },
                    is_demo=is_demo,
                )
                if alert:
                    triggered.append(alert)
        elif protocol == "UDP" and dst_port is not None and dst_port > 1024 and dst_port not in COMMON_PORTS:
            uncommon_threshold = int(ut_rule.get("uncommon_port_threshold", 25))
            with _lock:
                dq = _uncommon_port_history[src_ip]
                dq.append(now)
                cutoff = now - window
                while dq and dq[0] < cutoff:
                    dq.popleft()
                count = len(dq)
            if count >= uncommon_threshold:
                alert = create_alert(
                    rule_type="unusual_traffic",
                    title="Unusual High-Port UDP Traffic Pattern",
                    severity=ut_rule.get("severity", "Medium"),
                    src_ip=src_ip,
                    dst_ip=dst_ip,
                    reason=(
                        f"Source {src_ip} sent {count} UDP packets to non-standard high ports within {window}s "
                        f"(threshold: {uncommon_threshold})."
                    ),
                    recommended_action=(
                        "Review active applications (e.g., VoIP, gaming, QUIC/media streaming) on the source device."
                    ),
                    details={
                        "udp_high_port_count": count,
                        "sample_dst_port": dst_port,
                        "window_seconds": window,
                        "threshold": uncommon_threshold,
                    },
                    is_demo=is_demo,
                )
                if alert:
                    triggered.append(alert)

    return triggered


def evaluate_traffic_spike(
    interface_name: str, download_bps: float, upload_bps: float, is_demo: bool = False
) -> dict | None:
    """Rule 3: Check whether interface bandwidth exceeds the configured KB/s baseline threshold."""
    rules = get_rules()
    ts_rule = rules.get("traffic_spike", {})
    if not ts_rule.get("enabled"):
        return None

    threshold_kbps = float(ts_rule.get("threshold_kbps", 5000))
    total_kbps = (download_bps + upload_bps) / 1024.0
    if total_kbps >= threshold_kbps:
        return create_alert(
            rule_type="traffic_spike",
            title="Bandwidth Traffic Spike Detected",
            severity=ts_rule.get("severity", "Medium"),
            src_ip=interface_name,
            dst_ip="",
            reason=(
                f"Interface '{interface_name}' reached {total_kbps:.1f} KB/s combined throughput "
                f"(Download: {download_bps / 1024.0:.1f} KB/s, Upload: {upload_bps / 1024.0:.1f} KB/s), "
                f"exceeding the configured threshold of {threshold_kbps:.0f} KB/s."
            ),
            recommended_action=(
                "Check Traffic Analytics and top active devices to confirm whether a legitimate download, "
                "backup, update, or unexpected data transfer is occurring."
            ),
            details={
                "interface": interface_name,
                "total_kbps": round(total_kbps, 2),
                "download_kbps": round(download_bps / 1024.0, 2),
                "upload_kbps": round(upload_bps / 1024.0, 2),
                "threshold_kbps": threshold_kbps,
            },
            is_demo=is_demo,
        )
    return None


def evaluate_unknown_device(device: dict, is_demo: bool = False) -> dict | None:
    """Rule 4: Check whether a newly discovered device is absent from trusted_devices."""
    rules = get_rules()
    ud_rule = rules.get("unknown_device", {})
    if not ud_rule.get("enabled"):
        return None

    ip = device.get("ip_address", "")
    mac = device.get("mac_address", "")
    if not ip:
        return None

    conn = get_connection()
    try:
        trusted = conn.execute(
            """
            SELECT id FROM trusted_devices
            WHERE ip_address = ? OR (mac_address != '' AND LOWER(mac_address) = LOWER(?))
            """,
            (ip, mac),
        ).fetchone()
        if trusted:
            return None

        # Avoid duplicate open unknown_device alerts for the same IP
        existing_open = conn.execute(
            """
            SELECT id FROM security_alerts
            WHERE rule_type = 'unknown_device' AND src_ip = ? AND status = 'open'
            """,
            (ip,),
        ).fetchone()
        if existing_open:
            return None
    finally:
        conn.close()

    return create_alert(
        rule_type="unknown_device",
        title="Unapproved Local Network Device Detected",
        severity=ud_rule.get("severity", "Low"),
        src_ip=ip,
        dst_ip="",
        reason=(
            f"Discovered device {ip} (MAC: {mac or 'Unavailable'}, Hostname: {device.get('hostname') or 'Unknown'}) "
            f"is not in the approved Trusted Devices registry."
        ),
        recommended_action=(
            "Verify whether this device belongs on your authorized local network. "
            "If recognized, mark it as Trusted in Network Discovery or Settings."
        ),
        details={
            "ip_address": ip,
            "mac_address": mac,
            "hostname": device.get("hostname", ""),
        },
        is_demo=is_demo,
    )


def list_alerts(severity: str = None, status: str = None, rule_type: str = None, limit: int = 100) -> list[dict]:
    conn = get_connection()
    try:
        query = "SELECT * FROM security_alerts WHERE 1=1"
        params = []
        if severity and severity in VALID_SEVERITIES:
            query += " AND severity = ?"
            params.append(severity)
        if status and status in VALID_STATUSES:
            query += " AND status = ?"
            params.append(status)
        if rule_type:
            query += " AND rule_type = ?"
            params.append(rule_type)
        query += " ORDER BY detected_at DESC, id DESC LIMIT ?"
        params.append(min(max(1, int(limit)), 500))
        rows = conn.execute(query, params).fetchall()
        return [serialize_alert(r) for r in rows]
    finally:
        conn.close()


def update_alert_status(alert_id: int, new_status: str) -> dict | None:
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{new_status}'. Must be one of {VALID_STATUSES}.")
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE security_alerts SET status = ? WHERE id = ?",
            (new_status, alert_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM security_alerts WHERE id = ?", (alert_id,)
        ).fetchone()
        return serialize_alert(row)
    finally:
        conn.close()


def get_security_summary() -> dict:
    conn = get_connection()
    try:
        severity_counts = {s: 0 for s in VALID_SEVERITIES}
        for row in conn.execute(
            "SELECT severity, COUNT(*) as cnt FROM security_alerts GROUP BY severity"
        ).fetchall():
            if row["severity"] in severity_counts:
                severity_counts[row["severity"]] = row["cnt"]

        status_counts = {s: 0 for s in VALID_STATUSES}
        for row in conn.execute(
            "SELECT status, COUNT(*) as cnt FROM security_alerts GROUP BY status"
        ).fetchall():
            if row["status"] in status_counts:
                status_counts[row["status"]] = row["cnt"]

        open_by_severity = {s: 0 for s in VALID_SEVERITIES}
        for row in conn.execute(
            "SELECT severity, COUNT(*) as cnt FROM security_alerts WHERE status = 'open' GROUP BY severity"
        ).fetchall():
            if row["severity"] in open_by_severity:
                open_by_severity[row["severity"]] = row["cnt"]

        recent_rows = conn.execute(
            "SELECT * FROM security_alerts ORDER BY detected_at DESC, id DESC LIMIT 10"
        ).fetchall()
        recent = [serialize_alert(r) for r in recent_rows]

        total = sum(status_counts.values())
        rules = get_rules()
        active_rules = sum(1 for r in rules.values() if r.get("enabled"))

        return {
            "total_alerts": total,
            "open_alerts": status_counts["open"],
            "acknowledged_alerts": status_counts["acknowledged"],
            "resolved_alerts": status_counts["resolved"],
            "by_severity": severity_counts,
            "open_by_severity": open_by_severity,
            "by_status": status_counts,
            "active_rules_count": active_rules,
            "total_rules_count": len(rules),
            "recent_alerts": recent,
            "disclaimer": (
                "Security alerts indicate suspicious patterns based on configurable heuristics "
                "and do not constitute definitive proof of malicious activity."
            ),
        }
    finally:
        conn.close()


def run_controlled_rule_test(rule_type: str = "port_scan") -> dict:
    """
    Feed controlled synthetic test packets/metrics directly through the real rule-evaluation
    engine to verify and demonstrate detection logic safely (clearly tagged as controlled test).
    """
    rules = get_rules()
    generated_alerts = []

    if rule_type == "port_scan":
        threshold = int(rules.get("port_scan", {}).get("distinct_ports_threshold", 10))
        test_src = "192.168.1.240"
        test_dst = "192.168.1.1"
        # Clear cooldown for immediate verification
        with _lock:
            _recent_alert_cooldown.pop(("port_scan", test_src, test_dst), None)
            _port_history[test_src].clear()
        for p in range(1000, 1000 + threshold + 2):
            alerts = evaluate_packet(
                {
                    "src_ip": test_src,
                    "dst_ip": test_dst,
                    "src_port": 54321,
                    "dst_port": p,
                    "protocol": "TCP",
                    "tcp_flags": "S",
                    "length": 60,
                },
                is_demo=True,
            )
            generated_alerts.extend(alerts)
    elif rule_type == "repeated_connection":
        threshold = int(rules.get("repeated_connection", {}).get("attempts_threshold", 20))
        test_src = "192.168.1.241"
        test_dst = "192.168.1.10"
        with _lock:
            _recent_alert_cooldown.pop(("repeated_connection", test_src, test_dst), None)
            _conn_history[(test_src, test_dst, 22)].clear()
        for _ in range(threshold + 1):
            alerts = evaluate_packet(
                {
                    "src_ip": test_src,
                    "dst_ip": test_dst,
                    "src_port": 51000,
                    "dst_port": 22,
                    "protocol": "TCP",
                    "tcp_flags": "S",
                    "length": 60,
                },
                is_demo=True,
            )
            generated_alerts.extend(alerts)
    elif rule_type == "traffic_spike":
        threshold_kbps = float(rules.get("traffic_spike", {}).get("threshold_kbps", 5000))
        with _lock:
            _recent_alert_cooldown.pop(("traffic_spike", "Controlled-Test-NIC", ""), None)
        alert = evaluate_traffic_spike(
            "Controlled-Test-NIC",
            download_bps=(threshold_kbps * 1.35) * 1024,
            upload_bps=(threshold_kbps * 0.25) * 1024,
            is_demo=True,
        )
        if alert:
            generated_alerts.append(alert)
    elif rule_type == "unusual_traffic":
        threshold = int(rules.get("unusual_traffic", {}).get("icmp_threshold", 30))
        test_src = "192.168.1.242"
        test_dst = "192.168.1.1"
        with _lock:
            _recent_alert_cooldown.pop(("unusual_traffic", test_src, test_dst), None)
            _icmp_history[test_src].clear()
        for _ in range(threshold + 2):
            alerts = evaluate_packet(
                {
                    "src_ip": test_src,
                    "dst_ip": test_dst,
                    "src_port": None,
                    "dst_port": None,
                    "protocol": "ICMP",
                    "tcp_flags": "",
                    "length": 74,
                },
                is_demo=True,
            )
            generated_alerts.extend(alerts)
    else:
        raise ValueError(
            "Unsupported test rule_type. Choose from: port_scan, repeated_connection, traffic_spike, unusual_traffic."
        )

    return {
        "rule_type": rule_type,
        "alerts_triggered": len(generated_alerts),
        "alerts": generated_alerts,
        "note": "Executed using controlled synthetic test inputs through the live rule engine.",
    }

