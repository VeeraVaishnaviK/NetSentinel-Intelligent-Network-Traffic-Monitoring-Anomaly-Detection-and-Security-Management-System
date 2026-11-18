"""
Input validation helpers for network targets, subnets, ports, and dates.
"""

import ipaddress
import re
from datetime import datetime

HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$"
)
MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")


def is_valid_ip(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        ipaddress.ip_address(value.strip())
        return True
    except ValueError:
        return False


def is_valid_hostname_or_ip(value: str) -> bool:
    """Validate an IPv4/IPv6 address or RFC-compliant hostname without shell metacharacters."""
    if not value or not isinstance(value, str):
        return False
    target = value.strip()
    if len(target) > 253:
        return False
    # Explicitly block shell metacharacters or whitespace
    if any(ch in target for ch in (" ", ";", "&", "|", "$", "`", ">", "<", "\n", "\r", "'", '"')):
        return False
    if is_valid_ip(target):
        return True
    return bool(HOSTNAME_RE.match(target))


def is_valid_domain(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    domain = value.strip()
    if is_valid_ip(domain):
        return False
    return bool(HOSTNAME_RE.match(domain))


def validate_authorized_local_subnet(cidr: str):
    """
    Validate that a CIDR range is a private/link-local IPv4 network of reasonable local size (/22 to /30).
    Returns (ipaddress.IPv4Network, None) on success or (None, error_message) on failure.
    """
    if not cidr or not isinstance(cidr, str):
        return None, "Subnet CIDR is required (e.g., 192.168.1.0/24)."
    try:
        net = ipaddress.ip_network(cidr.strip(), strict=False)
    except ValueError:
        return None, f"Invalid CIDR subnet format: '{cidr}'."

    if net.version != 4:
        return None, "Only IPv4 local subnets are supported for ARP discovery."

    if not (net.is_private or net.is_link_local):
        return (
            None,
            f"Scanning public IP range '{net}' is prohibited. Only authorized private local networks (RFC 1918 / link-local) may be scanned.",
        )

    if net.prefixlen < 22:
        return (
            None,
            f"Subnet '{net}' is too broad (/{net.prefixlen}). Please specify a local subnet of /22 or smaller (e.g., /24).",
        )

    return net, None


def validate_port(value):
    if value is None or value == "":
        return None
    try:
        port = int(value)
        if 0 <= port <= 65535:
            return port
    except (ValueError, TypeError):
        pass
    return False


def is_valid_mac(value: str) -> bool:
    if not value:
        return True
    return bool(MAC_RE.match(value.strip()))


def parse_iso_date(value: str):
    if not value or not isinstance(value, str):
        return None
    val = value.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None
