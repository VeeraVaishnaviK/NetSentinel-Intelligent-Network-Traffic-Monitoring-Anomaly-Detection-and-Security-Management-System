"""
System permission and packet capture capability checks (Windows & POSIX).

Checks administrator/root privileges, Npcap availability on Windows,
and Scapy packet capture readiness so NetSentinel never exposes raw
capture without verifying permissions first.
"""

import ctypes
import os
import platform


def is_admin() -> bool:
    """Return True if the current process runs with Administrator (Windows) or root (POSIX) privileges."""
    system = platform.system().lower()
    if system == "windows":
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    else:
        try:
            return os.geteuid() == 0
        except AttributeError:
            return False


def has_npcap() -> bool:
    """On Windows, detect whether Npcap or WinPcap driver libraries are installed."""
    if platform.system().lower() != "windows":
        return True
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    candidates = [
        os.path.join(system_root, "System32", "Npcap", "wpcap.dll"),
        os.path.join(system_root, "System32", "wpcap.dll"),
        os.path.join(system_root, "SysWOW64", "Npcap", "wpcap.dll"),
    ]
    return any(os.path.exists(p) for p in candidates)


def check_scapy_available() -> tuple[bool, str]:
    """Check if Scapy can be imported cleanly."""
    try:
        import scapy.all  # noqa: F401
        return True, "Scapy installed"
    except Exception as exc:
        return False, f"Scapy unavailable: {exc}"


def get_capture_capabilities() -> dict:
    """
    Return a comprehensive capability report for packet capture and ARP discovery.
    """
    system = platform.system()
    admin = is_admin()
    npcap = has_npcap()
    scapy_ok, scapy_msg = check_scapy_available()

    can_capture_l2 = scapy_ok and npcap and (admin or system.lower() == "windows")
    # On Windows, Npcap installed with default user mode can capture even without admin if configured,
    # but raw sockets / full capture generally require Administrator + Npcap.
    # For strict safety per specification, require Admin AND Npcap on Windows (or root on Linux/macOS) for live capture.
    can_live_capture = scapy_ok and admin and npcap

    reasons = []
    if not scapy_ok:
        reasons.append(scapy_msg)
    if system.lower() == "windows" and not npcap:
        reasons.append(
            "Npcap driver is not installed. Install Npcap (https://npcap.com/) with WinPcap API-compatible mode enabled for Layer-2 Scapy packet capture and ARP scanning."
        )
    if not admin:
        if system.lower() == "windows":
            reasons.append(
                "Administrator privileges are required for raw packet capture. Run start.bat or your terminal as Administrator."
            )
        else:
            reasons.append("Root privileges (sudo) are required for raw packet capture.")

    return {
        "os": system,
        "is_admin": admin,
        "npcap_installed": npcap,
        "scapy_available": scapy_ok,
        "can_live_capture": can_live_capture,
        "can_arp_scapy": scapy_ok and npcap and admin,
        "can_arp_fallback": True,  # OS ARP table + local ping discovery fallback
        "can_l2_capture": can_capture_l2,
        "issues": reasons,
        "summary": (
            "Live packet capture and Scapy ARP discovery ready."
            if can_live_capture
            else " ".join(reasons)
        ),
    }
