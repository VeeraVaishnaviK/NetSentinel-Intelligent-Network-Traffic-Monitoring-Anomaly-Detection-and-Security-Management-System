"""Network interface, overview status, and local discovery routes."""

from flask import Blueprint, request

from app.database import get_all_settings, get_connection
from app.services import (
    diagnostics_service,
    network_service,
    packet_service,
    security_service,
    traffic_service,
)
from app.utils.permissions import get_capture_capabilities
from app.utils.responses import api_error, api_success

network_bp = Blueprint("network", __name__, url_prefix="/api/network")


@network_bp.route("/interfaces", methods=["GET"])
def get_interfaces():
    interfaces = network_service.list_interfaces()
    preferred = network_service.get_preferred_interface()
    return api_success({
        "interfaces": interfaces,
        "selected_interface": preferred["name"] if preferred else "",
        "capabilities": get_capture_capabilities(),
    })


@network_bp.route("/status", methods=["GET"])
def get_network_status():
    settings = get_all_settings()
    demo_mode = settings.get("demo_mode", False)
    interfaces = network_service.list_interfaces()
    preferred = network_service.get_preferred_interface()
    active_iface_name = preferred["name"] if preferred else ""

    traffic = traffic_service.get_current_traffic(active_iface_name)
    capture = packet_service.get_capture_status()
    devices = network_service.list_devices(include_demo=demo_mode)
    sec_summary = security_service.get_security_summary()
    pkt_stats = packet_service.get_packet_stats(include_demo=demo_mode)
    diag_recent = diagnostics_service.list_diagnostics_history(limit=5)

    # Recent activity timeline aggregated from sessions, alerts, diagnostics, devices
    conn = get_connection()
    try:
        active_session = conn.execute(
            "SELECT * FROM monitoring_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        recent_sessions = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM monitoring_sessions ORDER BY started_at DESC LIMIT 5"
            ).fetchall()
        ]
    finally:
        conn.close()

    online_devices = sum(1 for d in devices if d["status"] == "online")
    iface_up = bool(preferred and preferred.get("is_up"))

    # Determine network health & availability
    open_critical_high = (
        sec_summary["open_by_severity"].get("Critical", 0)
        + sec_summary["open_by_severity"].get("High", 0)
    )
    if not iface_up:
        health = "offline"
        availability = "Disconnected"
    elif open_critical_high > 0:
        health = "alert"
        availability = "Online (Alerts)"
    elif sec_summary["open_alerts"] > 0:
        health = "warning"
        availability = "Online (Warnings)"
    else:
        health = "healthy"
        availability = "Online"

    # Build recent activity timeline
    timeline = []
    for a in sec_summary["recent_alerts"][:4]:
        timeline.append({
            "type": "alert",
            "title": a["title"],
            "subtitle": f"{a['severity']} · Source {a['src_ip'] or 'N/A'}",
            "timestamp": a["detected_at"],
            "severity": a["severity"],
        })
    for dg in diag_recent[:3]:
        timeline.append({
            "type": "diagnostic",
            "title": f"{dg['test_type'].upper()} test: {dg['target']}",
            "subtitle": dg["summary"],
            "timestamp": dg["executed_at"],
            "severity": "Low" if dg["status"] == "success" else "Medium",
        })
    for sess in recent_sessions[:3]:
        timeline.append({
            "type": "session",
            "title": f"Packet capture on {sess['interface_name']}",
            "subtitle": f"Status: {sess['status'].upper()} · {sess['packets_captured']} packets",
            "timestamp": sess["started_at"],
            "severity": "Low",
        })
    timeline.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    return api_success({
        "active_interface": active_iface_name,
        "interface_details": preferred,
        "interfaces_count": len(interfaces),
        "monitoring_active": capture["capturing"],
        "active_session": dict(active_session) if active_session else None,
        "demo_mode": demo_mode,
        "health": health,
        "availability": availability,
        "capabilities": get_capture_capabilities(),
        "stats": {
            "connected_devices": online_devices,
            "total_devices": len(devices),
            "total_packets_captured": pkt_stats["total_packets"],
            "incoming_bytes_total": traffic["interface_metrics"]["bytes_recv_total"],
            "outgoing_bytes_total": traffic["interface_metrics"]["bytes_sent_total"],
            "download_bps": traffic["interface_metrics"]["download_bps"],
            "upload_bps": traffic["interface_metrics"]["upload_bps"],
            "packets_per_sec": traffic["interface_metrics"]["packets_per_sec"],
            "total_security_alerts": sec_summary["total_alerts"],
            "open_security_alerts": sec_summary["open_alerts"],
        },
        "recent_activity": timeline[:8],
    })


@network_bp.route("/discover", methods=["POST"])
def discover_network():
    body = request.get_json(silent=True) or {}
    interface_name = str(body.get("interface", "")).strip()
    subnet_cidr = str(body.get("subnet", "")).strip()
    authorized = bool(body.get("authorized", False))

    state, err = network_service.start_discovery(
        interface_name=interface_name,
        subnet_cidr=subnet_cidr,
        authorized=authorized,
    )
    if err:
        return api_error(err, status_code=400, code="DISCOVERY_VALIDATION_ERROR")
    return api_success(state, message="Network discovery started.")


@network_bp.route("/discover/stop", methods=["POST"])
def stop_discover_network():
    state = network_service.stop_discovery()
    return api_success(state, message="Network discovery stop requested.")


@network_bp.route("/discover/status", methods=["GET"])
def discovery_status():
    return api_success(network_service.get_discovery_status())


@network_bp.route("/devices", methods=["GET"])
def get_network_devices():
    devices = network_service.list_devices()
    return api_success({
        "devices": devices,
        "total": len(devices),
        "online": sum(1 for d in devices if d["status"] == "online"),
        "new_count": sum(1 for d in devices if d["is_new"]),
        "scan_status": network_service.get_discovery_status(),
    })

