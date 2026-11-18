# NetSentinel System Architecture

## 1. Overview
NetSentinel is a lightweight, local-first Computer Networks monitoring, analysis, and security management platform designed to run on a standard Windows (or Linux/macOS) laptop without cloud infrastructure, microservices, or external databases.

```
+-------------------------------------------------------------------+
|               React + Vite + Tailwind CSS Frontend                |
|  (DashboardLayout, 8 Modules, Recharts, Polling every 2.5-4s)     |
+---------------------------------+---------------------------------+
                                  | REST JSON (/api/* via Vite proxy)
                                  v
+-------------------------------------------------------------------+
|                   Flask REST API (backend/run.py)                 |
|  Blueprints: network, packets, traffic, security, devices,        |
|              diagnostics, reports, settings                       |
+-----+---------------+---------------+---------------+-------------+
      |               |               |               |
      v               v               v               v
+-----------+   +-----------+   +-----------+   +-----------+
|  Psutil   |   |   Scapy   |   |  Socket & |   | ReportLab |
| Interface |   | Live Sniff|   | Subprocess|   |  PDF/CSV  |
| Telemetry |   | & ARP Scan|   |Diagnostics|   |  Exports  |
+-----+-----+   +-----+-----+   +-----+-----+   +-----------+
      |               |               |
      +-------+-------+-------+-------+
              |               |
              v               v
   +----------------+   +------------------+
   | Rule-Based     |   | SQLite Database  |
   | Anomaly Engine |-->| netsentinel.db   |
   | (5 Rules)      |   | (8 Tables + WAL) |
   +----------------+   +------------------+
```

## 2. Backend Layers (`backend/app/`)
- **Routes (`app/routes/`)**: Thin Flask Blueprints handling HTTP input parsing, validation, and uniform JSON responses (`api_success` / `api_error`).
- **Services (`app/services/`)**: Core networking and business logic:
  - `network_service.py`: Interface enumeration (`psutil.net_if_addrs`, `net_if_stats`, `net_io_counters`) and authorized local subnet discovery (Scapy ARP broadcast with OS `arp -a` + ping sweep fallback).
  - `packet_service.py`: Threaded Scapy `sniff()` loop extracting safe header metadata only (IP/ports/TCP flags/DNS query names/visible cleartext HTTP request line). Enforces strict permission checks and capture/retention caps.
  - `traffic_service.py`: Lightweight daemon thread sampling OS NIC counters every 2.5 seconds to compute real download/upload B/s and PPS, kept explicitly separate from Scapy packet-level counters.
  - `security_service.py`: Sliding-window rule engine implementing 5 explainable heuristics (Port Scan, Repeated Connections, Traffic Spike, Unknown Device, Unusual Traffic) with cooldown deduplication.
  - `diagnostics_service.py`: Safe argument-array `subprocess.run` wrappers for `ping` and `tracert`/`traceroute`, Python `socket` DNS resolution, and TCP handshake connectivity probes.
  - `report_service.py`: Date-filtered aggregation, CSV generation, and multi-section ReportLab PDF generation with embedded bar charts.
  - `demo_service.py`: Clearly labelled synthetic DEMO MODE (`is_demo = 1`) for presentation environments lacking Npcap/Administrator privileges.
- **Database (`app/database.py`)**: SQLite with WAL mode, foreign keys enabled, indexes on timestamp/IP/protocol/status columns, and automatic retention pruning.

## 3. Security & Safety Design Choices
- **No `shell=True`**: All diagnostic subprocess calls pass strict argument arrays and validate hostnames/IPs against injection characters.
- **Authorized Local Networks Only**: Network discovery requires an explicit authorization flag and rejects public IP ranges or subnets broader than `/22`.
- **Metadata Only**: Complete packet payloads are never stored; HTTPS traffic is never claimed to be decrypted.
- **Passive Observation**: NetSentinel never modifies OS firewall rules or blocks hosts automatically.
- **Permission Verification**: Live Scapy packet capture checks Administrator/root privileges and Npcap availability before starting.

