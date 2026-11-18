"""Security Center alerts, summary, and configurable rules routes."""

from flask import Blueprint, request

from app.services import security_service
from app.utils.responses import api_error, api_success

security_bp = Blueprint("security", __name__, url_prefix="/api/security")


@security_bp.route("/alerts", methods=["GET"])
def get_alerts():
    severity = request.args.get("severity", "").strip() or None
    status = request.args.get("status", "").strip() or None
    rule_type = request.args.get("rule_type", "").strip() or None
    try:
        limit = int(request.args.get("limit", 100))
    except ValueError:
        limit = 100
    alerts = security_service.list_alerts(
        severity=severity, status=status, rule_type=rule_type, limit=limit
    )
    return api_success({"alerts": alerts, "total": len(alerts)})


@security_bp.route("/alerts/<int:alert_id>", methods=["PATCH"])
def patch_alert(alert_id: int):
    body = request.get_json(silent=True) or {}
    new_status = str(body.get("status", "")).strip().lower()
    try:
        updated = security_service.update_alert_status(alert_id, new_status)
    except ValueError as exc:
        return api_error(str(exc), 400, "INVALID_STATUS")
    if not updated:
        return api_error(f"Alert #{alert_id} not found.", 404, "NOT_FOUND")
    return api_success(updated, message=f"Alert status updated to '{new_status}'.")


@security_bp.route("/summary", methods=["GET"])
def get_summary():
    return api_success(security_service.get_security_summary())


@security_bp.route("/rules", methods=["GET"])
def get_rules():
    return api_success({"rules": security_service.get_rules()})


@security_bp.route("/rules", methods=["PUT"])
def put_rules():
    body = request.get_json(silent=True) or {}
    rules_payload = body.get("rules", body)
    if not isinstance(rules_payload, dict):
        return api_error("Expected a JSON object of rule configurations.", 400)
    updated = security_service.update_rules(rules_payload)
    return api_success({"rules": updated}, message="Security detection rules updated.")


@security_bp.route("/test-rule", methods=["POST"])
def test_security_rule():
    body = request.get_json(silent=True) or {}
    rule_type = str(body.get("rule_type", "port_scan")).strip()
    try:
        result = security_service.run_controlled_rule_test(rule_type=rule_type)
        return api_success(result, message="Controlled rule test completed.")
    except ValueError as exc:
        return api_error(str(exc), 400, "INVALID_RULE_TYPE")

