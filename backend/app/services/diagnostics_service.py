"""
Interactive Network Diagnostics Service.

Implements safe subprocess-based Ping and Traceroute (strictly using argument
arrays, never shell=True), Python socket DNS Lookup, and configurable Internet
Connectivity checks. Persists all executions in diagnostics_history.
"""

import json
import platform
import re
import socket
import subprocess
import time

from app.database import get_all_settings, get_connection, utc_now_iso
from app.models.schemas import serialize_diagnostic
from app.utils.validators import is_valid_domain, is_valid_hostname_or_ip


def _record_diagnostic(test_type: str, target: str, status: str, summary: str, result: dict) -> dict:
    now = utc_now_iso()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            INSERT INTO diagnostics_history (test_type, target, status, summary, result_json, executed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (test_type, target, status, summary, json.dumps(result), now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM diagnostics_history WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return serialize_diagnostic(row)
    finally:
        conn.close()


def run_ping(target: str, count: int = 4) -> dict:
    if not is_valid_hostname_or_ip(target):
        raise ValueError("Invalid target. Provide a valid IP address or hostname without spaces or special characters.")

    target = target.strip()
    count = min(max(1, int(count)), 8)
    is_win = platform.system().lower() == "windows"
    cmd = (
        ["ping", "-n", str(count), "-w", "2000", target]
        if is_win
        else ["ping", "-c", str(count), "-W", "2", target]
    )

    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        raw_output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    except subprocess.TimeoutExpired:
        result = {
            "target": target,
            "reachable": False,
            "packets_sent": count,
            "packets_received": 0,
            "packet_loss_percent": 100.0,
            "avg_rtt_ms": None,
            "min_rtt_ms": None,
            "max_rtt_ms": None,
            "raw_output": "Ping command timed out.",
            "os": platform.system(),
        }
        return _record_diagnostic("ping", target, "timeout", f"Ping to {target} timed out.", result)
    except FileNotFoundError:
        raise RuntimeError("System ping utility is not available on this OS.")

    duration_ms = round((time.time() - started) * 1000, 1)

    # Parse packet loss
    loss_pct = 100.0
    loss_match = re.search(r"(\d+(?:\.\d+)?)%\s*loss", raw_output, re.IGNORECASE)
    if not loss_match:
        loss_match = re.search(r"(\d+(?:\.\d+)?)%\s*packet loss", raw_output, re.IGNORECASE)
    if loss_match:
        loss_pct = float(loss_match.group(1))

    # Parse per-reply RTT values (handles both Windows `time=12ms` / `time<1ms` and Unix `time=12.3 ms`)
    rtts = []
    for m in re.finditer(r"time[=<]\s*(\d+(?:\.\d+)?)\s*ms", raw_output, re.IGNORECASE):
        rtts.append(float(m.group(1)))

    # Fallback summary avg parse (Windows `Average = 14ms`)
    avg_rtt = round(sum(rtts) / len(rtts), 2) if rtts else None
    min_rtt = round(min(rtts), 2) if rtts else None
    max_rtt = round(max(rtts), 2) if rtts else None

    if avg_rtt is None:
        win_avg = re.search(r"Average\s*=\s*(\d+)\s*ms", raw_output, re.IGNORECASE)
        if win_avg:
            avg_rtt = float(win_avg.group(1))

    received = len(rtts)
    if received == 0 and loss_pct < 100.0:
        received = max(1, round(count * (1 - loss_pct / 100.0)))

    reachable = proc.returncode == 0 and loss_pct < 100.0
    status = "success" if reachable else "failed"
    summary = (
        f"Reachable — avg {avg_rtt} ms, {loss_pct:.0f}% loss"
        if reachable and avg_rtt is not None
        else (f"Reachable — {loss_pct:.0f}% loss" if reachable else f"Unreachable ({loss_pct:.0f}% packet loss)")
    )

    result = {
        "target": target,
        "reachable": reachable,
        "packets_sent": count,
        "packets_received": received,
        "packet_loss_percent": loss_pct,
        "avg_rtt_ms": avg_rtt,
        "min_rtt_ms": min_rtt,
        "max_rtt_ms": max_rtt,
        "elapsed_ms": duration_ms,
        "raw_output": raw_output.strip(),
        "os": platform.system(),
    }
    return _record_diagnostic("ping", target, status, summary, result)


def run_traceroute(target: str, max_hops: int = 15) -> dict:
    if not is_valid_hostname_or_ip(target):
        raise ValueError("Invalid target. Provide a valid IP address or hostname.")

    target = target.strip()
    max_hops = min(max(1, int(max_hops)), 25)
    is_win = platform.system().lower() == "windows"

    cmd = (
        ["tracert", "-d", "-h", str(max_hops), "-w", "1000", target]
        if is_win
        else ["traceroute", "-n", "-m", str(max_hops), "-w", "1", target]
    )

    timed_out = False
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        raw_output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        raw_output = (exc.stdout.decode(errors="ignore") if isinstance(exc.stdout, bytes) else (exc.stdout or ""))
        if not raw_output:
            raw_output = "Traceroute timed out after 30 seconds."
    except FileNotFoundError:
        raise RuntimeError(
            "Traceroute utility ('tracert' on Windows / 'traceroute' on Linux/macOS) is not installed."
        )

    hops = []
    for line in raw_output.splitlines():
        m = re.match(r"^\s*(\d{1,2})\s+(.+)$", line)
        if not m:
            continue
        hop_num = int(m.group(1))
        rest = m.group(2).strip()
        if "request timed out" in rest.lower() or rest.startswith("* * *"):
            hops.append({
                "hop": hop_num,
                "ip": "*",
                "rtt_ms": None,
                "status": "timeout",
                "raw": rest,
            })
            continue

        ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+:[0-9a-fA-F:]+)", rest)
        rtts = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*ms", rest, re.IGNORECASE)]
        # Windows also prints `<1 ms`
        if "<1 ms" in rest.lower() and not rtts:
            rtts = [0.5]

        hop_ip = ip_match.group(1) if ip_match else "*"
        avg_rtt = round(sum(rtts) / len(rtts), 2) if rtts else None
        hops.append({
            "hop": hop_num,
            "ip": hop_ip,
            "rtt_ms": avg_rtt,
            "status": "timeout" if hop_ip == "*" else "reached",
            "raw": rest,
        })

    status = "timeout" if timed_out and not hops else ("success" if hops else "failed")
    summary = (
        f"Completed {len(hops)} hops to {target}" + (" (partial — command timed out)" if timed_out else "")
        if hops
        else f"Traceroute to {target} returned no hops."
    )

    result = {
        "target": target,
        "max_hops": max_hops,
        "hops_count": len(hops),
        "hops": hops,
        "timed_out": timed_out,
        "raw_output": raw_output.strip(),
        "os": platform.system(),
    }
    return _record_diagnostic("traceroute", target, status, summary, result)


def run_dns_lookup(domain: str) -> dict:
    if not domain or not isinstance(domain, str):
        raise ValueError("Domain name is required.")
    domain = domain.strip()
    if not is_valid_domain(domain):
        raise ValueError("Invalid domain name. Example: 'example.com' or 'google.com'.")

    started = time.time()
    try:
        socket.setdefaulttimeout(5.0)
        info = socket.getaddrinfo(domain, None)
        ipv4_list = sorted({item[4][0] for item in info if item[0] == socket.AF_INET})
        ipv6_list = sorted({item[4][0] for item in info if item[0] == socket.AF_INET6})
        canonical = ""
        aliases = []
        try:
            cname, aliases, _ = socket.gethostbyname_ex(domain)
            canonical = cname
        except Exception:
            canonical = domain

        elapsed_ms = round((time.time() - started) * 1000, 2)
        result = {
            "domain": domain,
            "resolved": True,
            "canonical_name": canonical,
            "aliases": aliases,
            "ipv4_addresses": ipv4_list,
            "ipv6_addresses": ipv6_list,
            "resolution_time_ms": elapsed_ms,
        }
        summary = f"Resolved {domain} -> {', '.join(ipv4_list[:3]) or ', '.join(ipv6_list[:2])} ({elapsed_ms} ms)"
        return _record_diagnostic("dns", domain, "success", summary, result)
    except socket.gaierror as exc:
        elapsed_ms = round((time.time() - started) * 1000, 2)
        result = {
            "domain": domain,
            "resolved": False,
            "ipv4_addresses": [],
            "ipv6_addresses": [],
            "resolution_time_ms": elapsed_ms,
            "error": str(exc),
        }
        return _record_diagnostic("dns", domain, "failed", f"DNS lookup failed for {domain}: {exc}", result)


def run_connectivity_test(targets: list[str] = None) -> dict:
    """Check internet / target connectivity using TCP socket handshake on port 443/53."""
    settings = get_all_settings()
    if not targets:
        targets = settings.get("connectivity_targets", ["8.8.8.8", "1.1.1.1", "google.com"])

    checks = []
    reachable_count = 0

    for raw_target in targets[:8]:
        target = str(raw_target).strip()
        if not is_valid_hostname_or_ip(target):
            checks.append({
                "target": target,
                "reachable": False,
                "latency_ms": None,
                "error": "Invalid target format",
            })
            continue

        port = 53 if target in ("8.8.8.8", "1.1.1.1", "9.9.9.9") else 443
        started = time.time()
        try:
            with socket.create_connection((target, port), timeout=3.0):
                latency = round((time.time() - started) * 1000, 2)
                reachable_count += 1
                checks.append({
                    "target": target,
                    "port": port,
                    "reachable": True,
                    "latency_ms": latency,
                    "error": None,
                })
        except Exception as exc:
            checks.append({
                "target": target,
                "port": port,
                "reachable": False,
                "latency_ms": None,
                "error": str(exc),
            })

    total = len(checks)
    if reachable_count == total and total > 0:
        overall = "online"
        status = "success"
    elif reachable_count > 0:
        overall = "degraded"
        status = "success"
    else:
        overall = "offline"
        status = "failed"

    summary = f"Connectivity {overall.upper()} ({reachable_count}/{total} targets reachable)"
    result = {
        "overall_status": overall,
        "reachable_count": reachable_count,
        "total_targets": total,
        "checks": checks,
    }
    return _record_diagnostic("connectivity", ", ".join([c["target"] for c in checks]), status, summary, result)


def list_diagnostics_history(limit: int = 30, test_type: str = None) -> list[dict]:
    conn = get_connection()
    try:
        where = "WHERE test_type = ?" if test_type else ""
        params = [test_type, min(max(1, int(limit)), 200)] if test_type else [min(max(1, int(limit)), 200)]
        rows = conn.execute(
            f"SELECT * FROM diagnostics_history {where} ORDER BY executed_at DESC, id DESC LIMIT ?",
            params,
        ).fetchall()
        return [serialize_diagnostic(r) for r in rows]
    finally:
        conn.close()

