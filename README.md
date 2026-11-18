# NetSentinel
### Intelligent Network Traffic Monitoring, Analysis and Security Management System

NetSentinel is a complete, locally runnable Computer Networks capstone project built with **React + Vite + Tailwind CSS + Recharts** on the frontend and **Python 3 + Flask + SQLite + Scapy + Psutil + ReportLab** on the backend.

It monitors local network interfaces in real time, discovers hosts on authorized private networks, captures and inspects safe packet metadata, analyzes traffic bandwidth, flags suspicious patterns via configurable rule-based anomaly detection, runs safe network diagnostics, and exports CSV/PDF audit reports.

---

## Key Modules
1. **Network Overview Dashboard**: Live OS interface throughput, connected devices, captured packets, security alerts, network health, traffic chart, protocol distribution, device bandwidth, and activity timeline.
2. **Network Discovery & Device Management**: Interface detection, authorized private-subnet ARP discovery (Scapy L2 with OS ARP cache + ping sweep fallback), newly discovered device indicators, CSV export, and SQLite Trusted Device registry.
3. **Live Packet Analyzer**: Scapy packet metadata capture (TCP, UDP, ICMP, DNS, visible HTTP) with permission checks, multi-field filtering (protocol, IP, source IP, destination IP, port), capture limits, and packet inspection panel.
4. **Network Traffic Analytics**: Real-time download/upload bandwidth, packets/sec, link utilization, time-range filtering (`5m`, `15m`, `1h`, `24h`), protocol comparison, and clear separation of OS interface counters vs packet-level capture counts.
5. **Security Center**: 5 configurable rule-based anomaly detectors (Port Scan, Repeated Connections, Traffic Spike, Unknown Device, Unusual Traffic), alert triage (Open / Acknowledged / Resolved), and controlled test-traffic verification.
6. **Network Diagnostics**: Safe argument-array Ping, Traceroute with timeout handling, Socket DNS Lookup, and configurable Internet Connectivity checks with execution history.
7. **Reports & Analytics**: Date-range filtered operational summaries with downloadable CSV and formatted ReportLab PDF reports.
8. **Settings**: Default interface selection, capture/retention caps, refresh intervals, rule thresholds, trusted device management, database cleanup with confirmation dialogs, and clearly-labelled Demo Mode toggle.

---

## Prerequisites
- **Windows 10/11** (also compatible with Linux/macOS)
- **Python 3.10+** (`python --version`)
- **Node.js 18+ and npm** (`node --version`, `npm --version`)
- **Npcap** (optional but required on Windows for live Layer-2 Scapy packet capture and Scapy ARP broadcast):
  - Download from [https://npcap.com/](https://npcap.com/)
  - During installation, check **"Install Npcap in WinPcap API-compatible Mode"**.

---

## Installation & Setup

### 1. Backend Setup
```powershell
cd backend
pip install -r requirements.txt
python run.py
```
The Flask API runs on `http://127.0.0.1:5000` and automatically initializes `backend/netsentinel.db`.

### 2. Frontend Setup
Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
The React dashboard opens on `http://localhost:5173` and proxies `/api/*` requests directly to Flask.

### 3. One-Click Windows Launch
Double-click **`start.bat`** (or right-click -> **Run as administrator** when Npcap is installed and you want live Scapy packet capture).

---

## Network Permissions & Demo Mode
- **Live Packet Capture (`/api/packets/start`)**: Requires **Administrator privileges + Npcap** on Windows (or `sudo` on Linux/macOS). NetSentinel verifies permissions before starting capture and displays actionable guidance if unavailable.
- **Network Discovery (`/api/network/discover`)**: Requires explicit user confirmation and restricts scanning strictly to RFC 1918 / link-local private subnets (`/22` or smaller). If Npcap/Admin is unavailable, NetSentinel safely falls back to OS ARP table + local ping sweep and notifies the user.
- **Clearly Labelled DEMO MODE**: For academic demonstrations on restricted machines without Npcap/Admin, click **Demo Mode** in the top navigation bar. Synthetic records are explicitly tagged `DEMO` (`is_demo = 1`) and completely removed when Demo Mode is disabled.

---

## Troubleshooting
| Issue | Cause & Resolution |
|---|---|
| `Live packet capture is unavailable (403)` | Run `start.bat` / terminal as **Administrator** and install **Npcap** with WinPcap API-compatible mode enabled, or use **Demo Mode** for walkthroughs. |
| `Unable to reach NetSentinel backend API` | Confirm `python run.py` is running in `backend/` on port `5000`. |
| `Scanning public IP range is prohibited` | NetSentinel intentionally blocks public IP scans. Enter your local private subnet (e.g., `192.168.1.0/24`). |
| `Traceroute shows * timeouts` | Some intermediate routers drop ICMP TTL-exceeded probes; NetSentinel marks those hops as `Timeout` and continues cleanly. |

---

## Documentation
- [System Architecture](docs/architecture.md)
- [Database Schema](docs/database-schema.md)
- [REST API Documentation](docs/api-documentation.md)

