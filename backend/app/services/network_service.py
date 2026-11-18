"""
Network Interface Enumeration & Local Network Discovery Service.

Uses psutil to detect local network interfaces, IPv4 addresses, netmasks,
and CIDR subnets. Uses Scapy ARP scanning when permissions & Npcap are
available, with a safe authorized local ARP-table + ping sweep fallback
on Windows/POSIX when Layer-2 raw sockets are unavailable.
"""

import ipaddress
import platform
import re
import socket
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor

import psutil

from app.database import get_all_settings, get_connection, set_setting, utc_now_iso
from app.models.schemas import serialize_device
from app.services import security_service
from app.utils.permissions import get_capture_capabilities
from app.utils.validators import validate_authorized_local_subnet

_scan_lock = threading.Lock()
_scan_stop_event = threading.Event()
_scan_state = {
    "running": False,
    "interface": "",
    "subnet": "",
    "method": "",
    "started_at": None,
    "finished_at": None,
    "discovered_count": 0,
    "new_devices_count": 0,
    "message": "",
    "error": None,
    "fallback_used": False,
}


def list_interfaces() -> list[dict]:
    """Enumerate local network interfaces with IPv4, netmask, subnet CIDR, MAC, speed, and IO stats."""
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    io_counters = psutil.net_io_counters(pernic=True)

    interfaces = []
    for iface_name, addr_list in addrs.items():
        ipv4 = ""
        netmask = ""
        subnet_cidr = ""
        mac = ""
        ipv6 = ""

        for addr in addr_list:
            family_name = str(addr.family)
            if addr.family == socket.AF_INET:
                ipv4 = addr.address
                netmask = addr.netmask or ""
                if ipv4 and netmask:
                    try:
                        net = ipaddress.IPv4Network(f"{ipv4}/{netmask}", strict=False)
                        subnet_cidr = str(net)
                    except ValueError:
                        subnet_cidr = ""
            elif addr.family == socket.AF_INET6:
                if not ipv6 and not addr.address.startswith("fe80"):
                    ipv6 = addr.address
            elif "AF_LINK" in family_name or "AF_PACKET" in family_name or getattr(psutil, "AF_LINK", -1) == addr.family:
                mac = addr.address.replace("-", ":").upper()

        st = stats.get(iface_name)
        io = io_counters.get(iface_name)
        is_up = bool(st.isup) if st else False
        speed_mbps = st.speed if st else 0
        mtu = st.mtu if st else 0
        is_loopback = ipv4.startswith("127.") or "loopback" in iface_name.lower()

        interfaces.append({
            "name": iface_name,
            "ipv4": ipv4,
            "netmask": netmask,
            "subnet": subnet_cidr,
            "mac": mac,
            "ipv6": ipv6,
            "is_up": is_up,
            "is_loopback": is_loopback,
            "speed_mbps": speed_mbps,
            "mtu": mtu,
            "bytes_sent": io.bytes_sent if io else 0,
            "bytes_recv": io.bytes_recv if io else 0,
            "packets_sent": io.packets_sent if io else 0,
            "packets_recv": io.packets_recv if io else 0,
        })

    virtual_keywords = ("vethernet", "wsl", "vmware", "virtualbox", "vbox", "hyper-v", "bluetooth", "docker", "tailscale")

    def is_virtual(name: str) -> bool:
        low = name.lower()
        return any(kw in low for kw in virtual_keywords)

    # Sort: active physical non-loopback with IPv4 first, then active virtual, then others
    interfaces.sort(
        key=lambda x: (
            not (x["is_up"] and bool(x["ipv4"]) and not x["is_loopback"] and not is_virtual(x["name"])),
            not (x["is_up"] and bool(x["ipv4"]) and not x["is_loopback"]),
            not x["is_up"],
            x["is_loopback"],
            x["name"].lower(),
        )
    )
    return interfaces


def get_preferred_interface() -> dict | None:
    """Return user's configured default interface, or best active non-loopback interface."""
    interfaces = list_interfaces()
    if not interfaces:
        return None

    settings = get_all_settings()
    default_name = settings.get("default_interface", "")
    if default_name:
        for iface in interfaces:
            if iface["name"] == default_name:
                return iface

    # Auto-select first active interface with a valid private/non-loopback IPv4
    for iface in interfaces:
        if iface["is_up"] and iface["ipv4"] and not iface["is_loopback"]:
            set_setting("default_interface", iface["name"])
            return iface

    return interfaces[0]


def _resolve_hostname(ip: str) -> str:
    try:
        socket.setdefaulttimeout(0.8)
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except Exception:
        return ""


def _parse_os_arp_table(target_network: ipaddress.IPv4Network) -> dict[str, str]:
    """Read the OS ARP cache (`arp -a`) safely using subprocess argument array."""
    found = {}
    try:
        proc = subprocess.run(
            ["arp", "-a"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = proc.stdout or ""
        # Matches Windows (`192.168.1.1   aa-bb-cc-dd-ee-ff   dynamic`) and Unix (`(192.168.1.1) at aa:bb:cc:dd:ee:ff`)
        pattern = re.compile(
            r"(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}[:-](?:[0-9a-fA-F]{2}[:-]){4}[0-9a-fA-F]{2})"
        )
        unix_pattern = re.compile(
            r"\((\d{1,3}(?:\.\d{1,3}){3})\)\s+at\s+([0-9a-fA-F]{2}:(?:[0-9a-fA-F]{2}:){4}[0-9a-fA-F]{2})"
        )
        for regex in (pattern, unix_pattern):
            for match in regex.finditer(output):
                ip_str = match.group(1)
                mac_str = match.group(2).replace("-", ":").upper()
                if mac_str in ("FF:FF:FF:FF:FF:FF", "00:00:00:00:00:00"):
                    continue
                try:
                    ip_obj = ipaddress.IPv4Address(ip_str)
                    if ip_obj in target_network and ip_obj != target_network.broadcast_address:
                        found[ip_str] = mac_str
                except ValueError:
                    continue
    except Exception:
        pass
    return found


def _ping_one_host(ip_str: str) -> bool:
    if _scan_stop_event.is_set():
        return False
    is_win = platform.system().lower() == "windows"
    cmd = ["ping", "-n", "1", "-w", "300", ip_str] if is_win else ["ping", "-c", "1", "-W", "1", ip_str]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=1.5, check=False)
        return res.returncode == 0
    except Exception:
        return False


def _scapy_arp_scan(subnet_cidr: str, interface_name: str = "") -> list[dict]:
    """Perform Layer-2 ARP discovery using Scapy."""
    from scapy.all import ARP, Ether, srp  # local import

    arp_req = ARP(pdst=subnet_cidr)
    broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
    packet = broadcast / arp_req

    kwargs = {"timeout": 3, "verbose": False}
    if interface_name:
        kwargs["iface"] = interface_name

    answered, _ = srp(packet, **kwargs)
    discovered = []
    for _, received in answered:
        if _scan_stop_event.is_set():
            break
        discovered.append({
            "ip_address": received.psrc,
            "mac_address": received.hwsrc.upper(),
        })
    return discovered


def _fallback_local_discovery(target_network: ipaddress.IPv4Network, local_ip: str, local_mac: str) -> list[dict]:
    """
    Authorized local network fallback when Scapy L2 / Npcap is unavailable:
    1. Light concurrent ping sweep of local subnet hosts (capped at 254 hosts) to populate OS ARP cache.
    2. Parse OS ARP table (`arp -a`) to collect IP + MAC pairs.
    3. Include local interface host.
    """
    hosts = [str(ip) for ip in target_network.hosts()][:254]
    responsive_ips = set()

    with ThreadPoolExecutor(max_workers=32) as pool:
        futures = {pool.submit(_ping_one_host, ip): ip for ip in hosts}
        for fut, ip in futures.items():
            if _scan_stop_event.is_set():
                break
            try:
                if fut.result():
                    responsive_ips.add(ip)
            except Exception:
                pass

    arp_map = _parse_os_arp_table(target_network)
    if local_ip and ipaddress.IPv4Address(local_ip) in target_network:
        arp_map[local_ip] = local_mac or arp_map.get(local_ip, "")
        responsive_ips.add(local_ip)

    all_ips = set(arp_map.keys()) | responsive_ips
    results = []
    for ip in sorted(all_ips, key=lambda x: ipaddress.IPv4Address(x)):
        results.append({
            "ip_address": ip,
            "mac_address": arp_map.get(ip, ""),
        })
    return results


def _persist_discovered_devices(discovered: list[dict], interface_name: str, is_demo: bool = False) -> tuple[int, int]:
    """
    Upsert discovered devices into SQLite, mark offline previously-seen devices on same scan if missing,
    and identify newly discovered devices compared with previous scans.
    """
    now = utc_now_iso()
    conn = get_connection()
    new_count = 0
    discovered_ips = {d["ip_address"] for d in discovered}

    try:
        existing_rows = conn.execute(
            "SELECT id, ip_address, mac_address, hostname FROM devices WHERE is_demo = ?",
            (1 if is_demo else 0,),
        ).fetchall()
        existing_map = {r["ip_address"]: dict(r) for r in existing_rows}

        # Reset is_new flag on previously existing devices before recording this scan
        conn.execute(
            "UPDATE devices SET is_new = 0 WHERE is_demo = ?", (1 if is_demo else 0,)
        )

        # Mark non-responding devices as offline
        for old_ip in existing_map:
            if old_ip not in discovered_ips:
                conn.execute(
                    "UPDATE devices SET status = 'offline' WHERE ip_address = ?",
                    (old_ip,),
                )

        new_devices_for_security = []
        for item in discovered:
            ip = item["ip_address"]
            mac = item.get("mac_address", "")
            hostname = item.get("hostname") or _resolve_hostname(ip)

            if ip in existing_map:
                old = existing_map[ip]
                conn.execute(
                    """
                    UPDATE devices
                    SET mac_address = CASE WHEN ? != '' THEN ? ELSE mac_address END,
                        hostname = CASE WHEN ? != '' THEN ? ELSE hostname END,
                        interface_name = ?,
                        status = 'online',
                        is_new = 0,
                        last_seen = ?
                    WHERE ip_address = ?
                    """,
                    (mac, mac, hostname, hostname, interface_name, now, ip),
                )
            else:
                new_count += 1
                conn.execute(
                    """
                    INSERT INTO devices
                    (ip_address, mac_address, hostname, interface_name, status, is_new,
                     first_discovered, last_seen, is_demo)
                    VALUES (?, ?, ?, ?, 'online', 1, ?, ?, ?)
                    """,
                    (ip, mac, hostname, interface_name, now, now, 1 if is_demo else 0),
                )
                new_devices_for_security.append({
                    "ip_address": ip,
                    "mac_address": mac,
                    "hostname": hostname,
                })

        conn.commit()
    finally:
        conn.close()

    # Evaluate Security Center Rule 4 (Unknown Device) for newly discovered hosts
    for dev in new_devices_for_security:
        security_service.evaluate_unknown_device(dev, is_demo=is_demo)

    return len(discovered), new_count


def _run_discovery_worker(interface_name: str, subnet_cidr: str, local_ip: str, local_mac: str):
    caps = get_capture_capabilities()
    target_net, err = validate_authorized_local_subnet(subnet_cidr)
    if err:
        with _scan_lock:
            _scan_state["running"] = False
            _scan_state["error"] = err
            _scan_state["finished_at"] = utc_now_iso()
        return

    discovered = []
    method = "scapy_arp"
    fallback_used = False
    message = ""

    try:
        if caps["can_arp_scapy"]:
            try:
                discovered = _scapy_arp_scan(str(target_net), interface_name)
                method = "Scapy ARP Broadcast"
                message = f"Completed Scapy Layer-2 ARP scan on {target_net}."
            except Exception as scapy_exc:
                fallback_used = True
                method = "OS ARP Cache + Local Ping Fallback"
                discovered = _fallback_local_discovery(target_net, local_ip, local_mac)
                message = (
                    f"Scapy ARP unavailable ({scapy_exc}). Used authorized local ARP-table & ping fallback on {target_net}."
                )
        else:
            fallback_used = True
            method = "OS ARP Cache + Local Ping Fallback"
            discovered = _fallback_local_discovery(target_net, local_ip, local_mac)
            message = (
                f"Scapy Layer-2 ARP requires Administrator privileges and Npcap. "
                f"Used OS ARP table + local ping discovery fallback on {target_net}."
            )

        if _scan_stop_event.is_set():
            message = "Scan stopped by user before completion."

        total_found, new_found = _persist_discovered_devices(discovered, interface_name, is_demo=False)

        with _scan_lock:
            _scan_state.update({
                "running": False,
                "method": method,
                "fallback_used": fallback_used,
                "discovered_count": total_found,
                "new_devices_count": new_found,
                "finished_at": utc_now_iso(),
                "message": message,
                "error": None,
            })
    except Exception as exc:
        with _scan_lock:
            _scan_state.update({
                "running": False,
                "finished_at": utc_now_iso(),
                "error": f"Discovery failed: {exc}",
                "message": "Network discovery encountered an error.",
            })


def start_discovery(interface_name: str = "", subnet_cidr: str = "", authorized: bool = False) -> tuple[dict, str | None]:
    """
    Start an asynchronous local network discovery scan after validating user authorization
    and private subnet boundaries.
    """
    if not authorized:
        return {}, "Explicit user authorization is required before scanning any local network."

    interfaces = list_interfaces()
    selected_iface = None
    if interface_name:
        for iface in interfaces:
            if iface["name"] == interface_name:
                selected_iface = iface
                break
        if selected_iface is None:
            return {}, f"Network interface '{interface_name}' was not found."
    else:
        selected_iface = get_preferred_interface()

    if not subnet_cidr:
        if selected_iface and selected_iface.get("subnet"):
            subnet_cidr = selected_iface["subnet"]
        else:
            return {}, "No IPv4 subnet could be determined for the selected interface. Please specify a private CIDR subnet (e.g., 192.168.1.0/24)."

    target_net, err = validate_authorized_local_subnet(subnet_cidr)
    if err:
        return {}, err

    with _scan_lock:
        if _scan_state["running"]:
            return dict(_scan_state), None

        _scan_stop_event.clear()
        _scan_state.update({
            "running": True,
            "interface": selected_iface["name"] if selected_iface else interface_name,
            "subnet": str(target_net),
            "method": "Initializing...",
            "started_at": utc_now_iso(),
            "finished_at": None,
            "discovered_count": 0,
            "new_devices_count": 0,
            "message": f"Scanning authorized local network {target_net}...",
            "error": None,
            "fallback_used": False,
        })

    local_ip = selected_iface["ipv4"] if selected_iface else ""
    local_mac = selected_iface["mac"] if selected_iface else ""

    t = threading.Thread(
        target=_run_discovery_worker,
        args=(_scan_state["interface"], str(target_net), local_ip, local_mac),
        daemon=True,
    )
    t.start()
    return dict(_scan_state), None


def stop_discovery() -> dict:
    _scan_stop_event.set()
    with _scan_lock:
        if _scan_state["running"]:
            _scan_state["message"] = "Stopping network discovery scan..."
        return dict(_scan_state)


def get_discovery_status() -> dict:
    with _scan_lock:
        return dict(_scan_state)


def list_devices(include_demo: bool = None) -> list[dict]:
    """Return discovered devices merged with trusted_devices metadata."""
    settings = get_all_settings()
    if include_demo is None:
        include_demo = settings.get("demo_mode", False)

    conn = get_connection()
    try:
        if include_demo:
            rows = conn.execute(
                """
                SELECT d.*,
                       t.id AS trusted_id,
                       t.description AS trusted_description
                FROM devices d
                LEFT JOIN trusted_devices t
                  ON t.ip_address = d.ip_address
                  OR (t.mac_address != '' AND LOWER(t.mac_address) = LOWER(d.mac_address))
                ORDER BY d.status = 'online' DESC, d.last_seen DESC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT d.*,
                       t.id AS trusted_id,
                       t.description AS trusted_description
                FROM devices d
                LEFT JOIN trusted_devices t
                  ON t.ip_address = d.ip_address
                  OR (t.mac_address != '' AND LOWER(t.mac_address) = LOWER(d.mac_address))
                WHERE d.is_demo = 0
                ORDER BY d.status = 'online' DESC, d.last_seen DESC
                """
            ).fetchall()
        return [serialize_device(r) for r in rows]
    finally:
        conn.close()


def trust_device(ip_address: str, mac_address: str = "", hostname: str = "", description: str = "") -> dict:
    """Add or update a device in the trusted_devices registry."""
    now = utc_now_iso()
    conn = get_connection()
    try:
        dev = conn.execute(
            "SELECT id, mac_address, hostname FROM devices WHERE ip_address = ?",
            (ip_address,),
        ).fetchone()
        device_id = dev["id"] if dev else None
        mac = mac_address or (dev["mac_address"] if dev else "")
        host = hostname or (dev["hostname"] if dev else "")

        conn.execute(
            """
            INSERT INTO trusted_devices (device_id, ip_address, mac_address, hostname, description, added_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(ip_address) DO UPDATE SET
                device_id = COALESCE(excluded.device_id, trusted_devices.device_id),
                mac_address = CASE WHEN excluded.mac_address != '' THEN excluded.mac_address ELSE trusted_devices.mac_address END,
                hostname = CASE WHEN excluded.hostname != '' THEN excluded.hostname ELSE trusted_devices.hostname END,
                description = excluded.description
            """,
            (device_id, ip_address, mac, host, description or "", now),
        )
        # Auto-resolve open unknown_device alerts for this IP
        conn.execute(
            """
            UPDATE security_alerts
            SET status = 'resolved'
            WHERE rule_type = 'unknown_device' AND src_ip = ? AND status = 'open'
            """,
            (ip_address,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM trusted_devices WHERE ip_address = ?", (ip_address,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def untrust_device(trusted_id: int) -> bool:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM trusted_devices WHERE id = ?", (trusted_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_trusted_devices() -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM trusted_devices ORDER BY added_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
