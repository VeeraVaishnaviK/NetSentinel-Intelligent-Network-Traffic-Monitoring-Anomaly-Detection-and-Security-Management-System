"""Application settings, history cleanup, and clearly labelled DEMO MODE routes."""

from flask import Blueprint, request

from app.database import get_all_settings, get_connection, set_setting
from app.services import demo_service, packet_service, security_service
from app.utils.responses import api_error, api_success
from app.utils.validators import is_valid_hostname_or_ip

settings_bp = Blueprint("settings", __name__, url_prefix="/api")


@settings_bp.route("/settings", methods=["GET"])
def get_settings():
    return api_success(get_all_settings())


@settings_bp.route("/settings", methods=["PUT"])
def update_settings():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return api_error("Invalid settings payload.", 400)

    if "default_interface" in body:
        set_setting("default_interface", str(body["default_interface"]).strip())

    if "packet_capture_limit" in body:
        try:
            val = int(body["packet_capture_limit"])
            if not (100 <= val <= 50000):
                return api_error("packet_capture_limit must be between 100 and 50,000.", 400)
            set_setting("packet_capture_limit", str(val))
        except (ValueError, TypeError):
            return api_error("packet_capture_limit must be an integer.", 400)

    if "packet_retention_limit" in body:
        try:
            val = int(body["packet_retention_limit"])
            if not (500 <= val <= 100000):
                return api_error("packet_retention_limit must be between 500 and 100,000.", 400)
            set_setting("packet_retention_limit", str(val))
        except (ValueError, TypeError):
            return api_error("packet_retention_limit must be an integer.", 400)

    if "refresh_interval_ms" in body:
        try:
            val = int(body["refresh_interval_ms"])
            if not (1000 <= val <= 30000):
                return api_error("refresh_interval_ms must be between 1000 and 30000 ms.", 400)
            set_setting("refresh_interval_ms", str(val))
        except (ValueError, TypeError):
            return api_error("refresh_interval_ms must be an integer.", 400)

    if "alert_notifications_enabled" in body:
        set_setting("alert_notifications_enabled", "true" if body["alert_notifications_enabled"] else "false")

    if "alert_min_severity" in body:
        sev = str(body["alert_min_severity"])
        if sev not in ("Critical", "High", "Medium", "Low"):
            return api_error("alert_min_severity must be Critical, High, Medium, or Low.", 400)
        set_setting("alert_min_severity", sev)

    if "connectivity_targets" in body:
        targets = body["connectivity_targets"]
        if not isinstance(targets, list) or not targets:
            return api_error("connectivity_targets must be a non-empty list.", 400)
        cleaned = [str(t).strip() for t in targets if str(t).strip()]
        for t in cleaned:
            if not is_valid_hostname_or_ip(t):
                return api_error(f"Invalid connectivity target: '{t}'.", 400)
        set_setting("connectivity_targets", cleaned)

    if "security_rules" in body and isinstance(body["security_rules"], dict):
        security_service.update_rules(body["security_rules"])

    return api_success(get_all_settings(), message="Settings updated successfully.")


@settings_bp.route("/settings/clear-history", methods=["POST"])
def clear_history():
    body = request.get_json(silent=True) or {}
    scope = str(body.get("scope", "all")).strip().lower()
    valid_scopes = {"packets", "traffic", "alerts", "diagnostics", "devices", "all"}
    if scope not in valid_scopes:
        return api_error(f"Invalid clear scope '{scope}'. Choose from {sorted(valid_scopes)}.", 400)

    if scope in ("packets", "all"):
        packet_service.stop_capture()

    conn = get_connection()
    try:
        if scope in ("packets", "all"):
            conn.execute("DELETE FROM captured_packets")
            conn.execute("DELETE FROM monitoring_sessions")
        if scope in ("traffic", "all"):
            conn.execute("DELETE FROM traffic_statistics")
        if scope in ("alerts", "all"):
            conn.execute("DELETE FROM security_alerts")
        if scope in ("diagnostics", "all"):
            conn.execute("DELETE FROM diagnostics_history")
        if scope in ("devices", "all"):
            conn.execute("DELETE FROM devices")
        conn.commit()
    finally:
        conn.close()

    if scope == "all":
        set_setting("demo_mode", "false")

    return api_success({"cleared": scope}, message=f"Historical records cleared ({scope}).")


@settings_bp.route("/demo/toggle", methods=["POST"])
def toggle_demo_mode():
    body = request.get_json(silent=True) or {}
    enable = body.get("enabled")
    if enable is None:
        enable = not demo_service.is_demo_mode()
    else:
        enable = bool(enable)

    if enable:
        result = demo_service.enable_demo_mode()
    else:
        result = demo_service.disable_demo_mode()

    return api_success(result, message=result["message"])

