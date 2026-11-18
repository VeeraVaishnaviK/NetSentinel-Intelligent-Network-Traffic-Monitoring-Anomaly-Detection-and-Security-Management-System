# NetSentinel SQLite Database Schema

Database file: `backend/netsentinel.db` (SQLite 3 with `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`).

## Tables

### 1. `devices`
Stores local hosts discovered via ARP scanning or local network discovery.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique device record ID |
| `ip_address` | TEXT | NOT NULL UNIQUE | Discovered IPv4 address |
| `mac_address` | TEXT | DEFAULT '' | Resolved hardware MAC address |
| `hostname` | TEXT | DEFAULT '' | Reverse-DNS hostname (if resolvable) |
| `interface_name` | TEXT | DEFAULT '' | Network interface used during discovery |
| `status` | TEXT | NOT NULL DEFAULT 'online' | `online` or `offline` |
| `is_new` | INTEGER | NOT NULL DEFAULT 1 | `1` if first seen in the most recent scan |
| `bytes_sent` | INTEGER | NOT NULL DEFAULT 0 | Captured bytes sourced from this IP |
| `bytes_received` | INTEGER | NOT NULL DEFAULT 0 | Captured bytes destined to this IP |
| `packet_count` | INTEGER | NOT NULL DEFAULT 0 | Captured packets involving this IP |
| `first_discovered` | TEXT | NOT NULL | UTC ISO-8601 first seen timestamp |
| `last_seen` | TEXT | NOT NULL | UTC ISO-8601 last seen timestamp |
| `is_demo` | INTEGER | NOT NULL DEFAULT 0 | `1` if created by Demo Mode |

### 2. `trusted_devices`
Registry of administrator-approved devices.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Trusted registry entry ID |
| `device_id` | INTEGER | FK -> `devices(id)` ON DELETE SET NULL | Linked discovered device |
| `ip_address` | TEXT | NOT NULL UNIQUE | Approved IP address |
| `mac_address` | TEXT | DEFAULT '' | Approved MAC address |
| `hostname` | TEXT | DEFAULT '' | Approved hostname |
| `description` | TEXT | DEFAULT '' | Administrator label/owner note |
| `added_at` | TEXT | NOT NULL | UTC ISO-8601 approval timestamp |

### 3. `monitoring_sessions`
Tracks live packet capture sessions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Session ID |
| `interface_name` | TEXT | NOT NULL | Monitored network interface |
| `started_at` | TEXT | NOT NULL | Session start time (UTC) |
| `ended_at` | TEXT | NULL | Session end time (UTC) |
| `status` | TEXT | NOT NULL DEFAULT 'active' | `active` or `stopped` |
| `packets_captured` | INTEGER | NOT NULL DEFAULT 0 | Packet count captured in session |
| `is_demo` | INTEGER | NOT NULL DEFAULT 0 | Demo flag |

### 4. `captured_packets`
Stores safe packet header metadata only (never raw payloads). Subject to retention limits (`packet_retention_limit`).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Packet metadata record ID |
| `session_id` | INTEGER | FK -> `monitoring_sessions(id)` ON DELETE CASCADE | Parent capture session |
| `timestamp` | TEXT | NOT NULL | Capture timestamp (UTC) |
| `src_ip` | TEXT | DEFAULT '' | Source IPv4/IPv6 address |
| `dst_ip` | TEXT | DEFAULT '' | Destination IPv4/IPv6 address |
| `src_port` | INTEGER | NULL | Source TCP/UDP port |
| `dst_port` | INTEGER | NULL | Destination TCP/UDP port |
| `protocol` | TEXT | NOT NULL | `TCP`, `UDP`, `ICMP`, `DNS`, `HTTP`, `ARP`, `OTHER` |
| `length` | INTEGER | NOT NULL DEFAULT 0 | Frame/packet length in bytes |
| `tcp_flags` | TEXT | DEFAULT '' | TCP header flags (e.g., `S`, `SA`, `PA`, `A`) |
| `dns_query` | TEXT | DEFAULT '' | Queried domain name for DNS packets |
| `http_info` | TEXT | DEFAULT '' | Visible cleartext HTTP request/status line only |
| `summary` | TEXT | DEFAULT '' | Human-readable packet summary |
| `direction` | TEXT | DEFAULT 'local' | `inbound`, `outbound`, or `local` |
| `is_demo` | INTEGER | NOT NULL DEFAULT 0 | Demo flag |

### 5. `traffic_statistics`
Periodic OS interface-level throughput samples collected via `psutil`. Subject to retention limit (`traffic_retention_rows`).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Sample ID |
| `session_id` | INTEGER | FK -> `monitoring_sessions(id)` ON DELETE SET NULL | Optional active session |
| `interface_name` | TEXT | NOT NULL | Sampled interface name |
| `timestamp` | TEXT | NOT NULL | Sample timestamp (UTC) |
| `bytes_recv` | INTEGER | NOT NULL DEFAULT 0 | Cumulative NIC received bytes |
| `bytes_sent` | INTEGER | NOT NULL DEFAULT 0 | Cumulative NIC sent bytes |
| `bytes_recv_delta` | INTEGER | NOT NULL DEFAULT 0 | Bytes received since previous sample |
| `bytes_sent_delta` | INTEGER | NOT NULL DEFAULT 0 | Bytes sent since previous sample |
| `download_bps` | REAL | NOT NULL DEFAULT 0 | Computed incoming bytes/sec |
| `upload_bps` | REAL | NOT NULL DEFAULT 0 | Computed outgoing bytes/sec |
| `packets_recv` | INTEGER | NOT NULL DEFAULT 0 | Cumulative NIC packets received |
| `packets_sent` | INTEGER | NOT NULL DEFAULT 0 | Cumulative NIC packets sent |
| `packets_per_sec` | REAL | NOT NULL DEFAULT 0 | Computed NIC packets/sec |
| `is_demo` | INTEGER | NOT NULL DEFAULT 0 | Demo flag |

### 6. `security_alerts`
Stores alerts produced by the 5 configurable anomaly detection rules.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Alert ID |
| `alert_code` | TEXT | NOT NULL | Human-readable alert code (e.g., `NS-PS-141230123`) |
| `rule_type` | TEXT | NOT NULL | `port_scan`, `repeated_connection`, `traffic_spike`, `unknown_device`, `unusual_traffic` |
| `title` | TEXT | NOT NULL | Alert title |
| `severity` | TEXT | NOT NULL | `Critical`, `High`, `Medium`, `Low` |
| `src_ip` | TEXT | DEFAULT '' | Source IP or interface |
| `dst_ip` | TEXT | DEFAULT '' | Destination IP (if applicable) |
| `detected_at` | TEXT | NOT NULL | Detection timestamp (UTC) |
| `reason` | TEXT | NOT NULL | Explainable detection reason |
| `recommended_action` | TEXT | NOT NULL | Guidance for administrator |
| `status` | TEXT | NOT NULL DEFAULT 'open' | `open`, `acknowledged`, `resolved` |
| `details_json` | TEXT | DEFAULT '{}' | JSON evidence metadata |
| `is_demo` | INTEGER | NOT NULL DEFAULT 0 | Demo flag |

### 7. `diagnostics_history`
Audit log of Ping, Traceroute, DNS Lookup, and Connectivity tests.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Execution ID |
| `test_type` | TEXT | NOT NULL | `ping`, `traceroute`, `dns`, `connectivity` |
| `target` | TEXT | NOT NULL | Target IP/domain/list |
| `status` | TEXT | NOT NULL | `success`, `failed`, `timeout` |
| `summary` | TEXT | DEFAULT '' | Short result summary |
| `result_json` | TEXT | NOT NULL | Full structured output JSON |
| `executed_at` | TEXT | NOT NULL | Execution timestamp (UTC) |

### 8. `application_settings`
Key-value configuration store (including JSON-serialized security rule thresholds).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | TEXT | PRIMARY KEY | Setting identifier |
| `value` | TEXT | NOT NULL | String or JSON value |
| `updated_at` | TEXT | NOT NULL | Last updated timestamp (UTC) |

