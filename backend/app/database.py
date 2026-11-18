"""
NetSentinel SQLite Database Manager.

Manages database connections, table initialization, indexes, default settings,
and retention-based cleanup to keep the local SQLite database lightweight.
"""

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "netsentinel.db")

_db_lock = threading.Lock()


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_connection() -> sqlite3.Connection:
    """Create a thread-safe SQLite connection with Row factory and FK enforcement."""
    conn = sqlite3.connect(DB_PATH, timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


DEFAULT_SETTINGS = {
    "default_interface": "",
    "packet_capture_limit": "5000",
    "packet_retention_limit": "10000",
    "traffic_retention_rows": "5000",
    "refresh_interval_ms": "2500",
    "demo_mode": "false",
    "connectivity_targets": json.dumps(["8.8.8.8", "1.1.1.1", "google.com"]),
    "alert_notifications_enabled": "true",
    "alert_min_severity": "Low",
    "security_rules": json.dumps({
        "port_scan": {
            "enabled": True,
            "name": "Port Scan Indicator",
            "description": "Detects a single source IP contacting multiple distinct destination ports within a time window.",
            "distinct_ports_threshold": 10,
            "time_window_seconds": 60,
            "severity": "High",
        },
        "repeated_connection": {
            "enabled": True,
            "name": "Repeated Connection Attempts",
            "description": "Detects repeated connection attempts (SYN or rapid packets) from one source to the same destination/port.",
            "attempts_threshold": 20,
            "time_window_seconds": 60,
            "severity": "Medium",
        },
        "traffic_spike": {
            "enabled": True,
            "name": "Traffic Spike Indicator",
            "description": "Detects interface bandwidth exceeding a configurable baseline threshold (KB/s).",
            "threshold_kbps": 5000,
            "severity": "Medium",
        },
        "unknown_device": {
            "enabled": True,
            "name": "Unknown / Unapproved Device",
            "description": "Flags discovered local network devices that are not listed in the Trusted Devices registry.",
            "severity": "Low",
        },
        "unusual_traffic": {
            "enabled": True,
            "name": "Unusual Traffic Pattern",
            "description": "Flags unusual protocol spikes (e.g., high ICMP echo volume or uncommon high-port UDP bursts).",
            "icmp_threshold": 30,
            "uncommon_port_threshold": 25,
            "time_window_seconds": 60,
            "severity": "Medium",
        },
    }),
}


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    mac_address TEXT DEFAULT '',
    hostname TEXT DEFAULT '',
    interface_name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'online',
    is_new INTEGER NOT NULL DEFAULT 1,
    bytes_sent INTEGER NOT NULL DEFAULT 0,
    bytes_received INTEGER NOT NULL DEFAULT 0,
    packet_count INTEGER NOT NULL DEFAULT 0,
    first_discovered TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trusted_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    ip_address TEXT NOT NULL,
    mac_address TEXT DEFAULT '',
    hostname TEXT DEFAULT '',
    description TEXT DEFAULT '',
    added_at TEXT NOT NULL,
    UNIQUE(ip_address)
);

CREATE TABLE IF NOT EXISTS monitoring_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interface_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    packets_captured INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS captured_packets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    src_ip TEXT DEFAULT '',
    dst_ip TEXT DEFAULT '',
    src_port INTEGER,
    dst_port INTEGER,
    protocol TEXT NOT NULL,
    length INTEGER NOT NULL DEFAULT 0,
    tcp_flags TEXT DEFAULT '',
    dns_query TEXT DEFAULT '',
    http_info TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    direction TEXT DEFAULT 'local',
    is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traffic_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES monitoring_sessions(id) ON DELETE SET NULL,
    interface_name TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    bytes_recv INTEGER NOT NULL DEFAULT 0,
    bytes_sent INTEGER NOT NULL DEFAULT 0,
    bytes_recv_delta INTEGER NOT NULL DEFAULT 0,
    bytes_sent_delta INTEGER NOT NULL DEFAULT 0,
    download_bps REAL NOT NULL DEFAULT 0,
    upload_bps REAL NOT NULL DEFAULT 0,
    packets_recv INTEGER NOT NULL DEFAULT 0,
    packets_sent INTEGER NOT NULL DEFAULT 0,
    packets_per_sec REAL NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_code TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    src_ip TEXT DEFAULT '',
    dst_ip TEXT DEFAULT '',
    detected_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    details_json TEXT DEFAULT '{}',
    is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS diagnostics_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_type TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT DEFAULT '',
    result_json TEXT NOT NULL,
    executed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_trusted_ip ON trusted_devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_packets_ts ON captured_packets(timestamp);
CREATE INDEX IF NOT EXISTS idx_packets_proto ON captured_packets(protocol);
CREATE INDEX IF NOT EXISTS idx_packets_src ON captured_packets(src_ip);
CREATE INDEX IF NOT EXISTS idx_packets_dst ON captured_packets(dst_ip);
CREATE INDEX IF NOT EXISTS idx_packets_session ON captured_packets(session_id);
CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_statistics(timestamp);
CREATE INDEX IF NOT EXISTS idx_traffic_iface ON traffic_statistics(interface_name);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON security_alerts(detected_at);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON security_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_diag_ts ON diagnostics_history(executed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON monitoring_sessions(status);
"""


def init_db() -> None:
    """Initialize SQLite schema, indexes, default settings, and close stale active sessions."""
    with _db_lock:
        conn = get_connection()
        try:
            conn.executescript(SCHEMA_SQL)
            now = utc_now_iso()
            for key, value in DEFAULT_SETTINGS.items():
                conn.execute(
                    """
                    INSERT OR IGNORE INTO application_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    """,
                    (key, value, now),
                )
            # Mark any previously orphaned 'active' sessions as 'stopped' on restart
            conn.execute(
                """
                UPDATE monitoring_sessions
                SET status = 'stopped', ended_at = COALESCE(ended_at, ?)
                WHERE status = 'active'
                """,
                (now,),
            )
            conn.commit()
        finally:
            conn.close()


def get_setting(key: str, default=None):
    """Fetch a single setting value from application_settings."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM application_settings WHERE key = ?", (key,)
        ).fetchone()
        if row is None:
            return default
        return row["value"]
    finally:
        conn.close()


def get_all_settings() -> dict:
    """Return all application settings with JSON-parsed complex values."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT key, value, updated_at FROM application_settings").fetchall()
        raw = {row["key"]: row["value"] for row in rows}
    finally:
        conn.close()

    def parse_int(k, fallback):
        try:
            return int(raw.get(k, fallback))
        except (ValueError, TypeError):
            return fallback

    def parse_bool(k, fallback=False):
        val = str(raw.get(k, str(fallback))).lower()
        return val in ("true", "1", "yes")

    def parse_json(k, fallback):
        try:
            return json.loads(raw.get(k, ""))
        except (ValueError, TypeError):
            return fallback

    return {
        "default_interface": raw.get("default_interface", ""),
        "packet_capture_limit": parse_int("packet_capture_limit", 5000),
        "packet_retention_limit": parse_int("packet_retention_limit", 10000),
        "traffic_retention_rows": parse_int("traffic_retention_rows", 5000),
        "refresh_interval_ms": parse_int("refresh_interval_ms", 2500),
        "demo_mode": parse_bool("demo_mode", False),
        "connectivity_targets": parse_json(
            "connectivity_targets", ["8.8.8.8", "1.1.1.1", "google.com"]
        ),
        "alert_notifications_enabled": parse_bool("alert_notifications_enabled", True),
        "alert_min_severity": raw.get("alert_min_severity", "Low"),
        "security_rules": parse_json(
            "security_rules", json.loads(DEFAULT_SETTINGS["security_rules"])
        ),
    }


def set_setting(key: str, value) -> None:
    """Persist a single setting value."""
    serialized = value if isinstance(value, str) else json.dumps(value)
    with _db_lock:
        conn = get_connection()
        try:
            conn.execute(
                """
                INSERT INTO application_settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, serialized, utc_now_iso()),
            )
            conn.commit()
        finally:
            conn.close()


def enforce_retention_limits() -> None:
    """Trim old captured_packets and traffic_statistics rows to stay within retention limits."""
    settings = get_all_settings()
    pkt_limit = max(500, settings.get("packet_retention_limit", 10000))
    traffic_limit = max(500, settings.get("traffic_retention_rows", 5000))

    with _db_lock:
        conn = get_connection()
        try:
            conn.execute(
                """
                DELETE FROM captured_packets
                WHERE id NOT IN (
                    SELECT id FROM captured_packets ORDER BY id DESC LIMIT ?
                )
                """,
                (pkt_limit,),
            )
            conn.execute(
                """
                DELETE FROM traffic_statistics
                WHERE id NOT IN (
                    SELECT id FROM traffic_statistics ORDER BY id DESC LIMIT ?
                )
                """,
                (traffic_limit,),
            )
            conn.commit()
        finally:
            conn.close()
