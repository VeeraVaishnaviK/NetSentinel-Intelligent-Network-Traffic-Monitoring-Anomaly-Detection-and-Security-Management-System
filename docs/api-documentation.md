# NetSentinel REST API Documentation

Base URL: `http://127.0.0.1:5000/api`

All JSON endpoints follow a consistent response envelope:
```json
{
  "success": true,
  "message": "OK",
  "data": { ... }
}
```
Error responses return appropriate HTTP status codes (`400`, `403`, `404`, `500`, `501`):
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error explanation"
  }
}
```

---

## Network Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check for Flask API |
| `GET` | `/api/network/interfaces` | Enumerate OS network interfaces (`psutil`) + capture capability flags |
| `GET` | `/api/network/status` | Live overview telemetry, health status, active session, recent activity |
| `POST` | `/api/network/discover` | Start authorized local subnet scan (`{ interface, subnet, authorized: true }`) |
| `POST` | `/api/network/discover/stop` | Stop an active discovery scan |
| `GET` | `/api/network/discover/status` | Poll discovery scan progress, method, and fallback details |
| `GET` | `/api/network/devices` | List discovered local network devices with online/new/trust metadata |

## Packet Capture Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/packets/start` | Start Scapy live packet capture (`{ interface }`). Enforces Admin + Npcap check (`403` if missing) |
| `POST` | `/api/packets/stop` | Stop active capture session and run retention cleanup |
| `GET` | `/api/packets` | Query captured packet metadata. Params: `protocol`, `ip`, `src_ip`, `dst_ip`, `port`, `limit`, `offset` |
| `GET` | `/api/packets/stats` | Protocol distribution, top talkers, total bytes/packets, capture rate |

## Traffic Analytics Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/traffic/current` | Current OS interface counters (`interface_metrics`) separated from packet capture stats (`captured_packet_metrics`) |
| `GET` | `/api/traffic/history` | Time-series traffic history. Params: `range` (`5m`, `15m`, `1h`, `24h`), `interface` |
| `GET` | `/api/traffic/protocols` | Protocol distribution + device-wise traffic breakdown |

## Security Center Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/security/alerts` | List security alerts. Params: `severity`, `status`, `rule_type`, `limit` |
| `PATCH` | `/api/security/alerts/<id>` | Update alert status (`{ status: "open" | "acknowledged" | "resolved" }`) |
| `GET` | `/api/security/summary` | Alert counts by severity & status, active rule count, recent alerts |
| `GET` | `/api/security/rules` | Retrieve all 5 configurable anomaly detection rules |
| `PUT` | `/api/security/rules` | Update detection rule thresholds and enabled toggles |
| `POST` | `/api/security/test-rule` | Run controlled synthetic test traffic through a specific rule (`port_scan`, `repeated_connection`, `traffic_spike`, `unusual_traffic`) |

## Device Management Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/devices` | List all discovered devices and trusted device registry entries |
| `POST` | `/api/devices/trust` | Mark a device as trusted (`{ ip_address, mac_address, hostname, description }`) |
| `DELETE` | `/api/devices/trust/<id>` | Remove a device from the trusted registry |

## Diagnostics Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/diagnostics/ping` | Safe subprocess ping (`{ target, count }`) |
| `POST` | `/api/diagnostics/traceroute` | Safe subprocess traceroute (`{ target, max_hops }`) |
| `POST` | `/api/diagnostics/dns` | Socket DNS resolution (`{ domain }`) |
| `POST` | `/api/diagnostics/connectivity` | TCP handshake internet connectivity check (`{ targets }`) |
| `GET` | `/api/diagnostics/history` | Retrieve recorded diagnostics execution history |

## Reports Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/reports/summary` | Aggregated monitoring summary. Params: `start_date`, `end_date` (`YYYY-MM-DD`) |
| `GET` | `/api/reports/export/csv` | Download CSV report. Params: `start_date`, `end_date`, `section` (`full` or `devices`) |
| `GET` | `/api/reports/export/pdf` | Download formatted ReportLab PDF report with charts and tables |

## Settings & Demo Mode Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/settings` | Retrieve all persisted application settings |
| `PUT` | `/api/settings` | Update monitoring, retention, notification, and threshold settings |
| `POST` | `/api/settings/clear-history` | Clear historical database records (`{ scope: "packets" | "traffic" | "alerts" | "diagnostics" | "devices" | "all" }`) |
| `POST` | `/api/demo/toggle` | Explicitly enable or disable clearly-labelled DEMO MODE (`{ enabled: true | false }`) |

