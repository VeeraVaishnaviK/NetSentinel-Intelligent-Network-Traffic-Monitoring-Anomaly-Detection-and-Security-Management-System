"""Network diagnostics routes: Ping, Traceroute, DNS Lookup, Connectivity, History."""

from flask import Blueprint, request

from app.services import diagnostics_service
from app.utils.responses import api_error, api_success

diagnostics_bp = Blueprint("diagnostics", __name__, url_prefix="/api/diagnostics")


@diagnostics_bp.route("/ping", methods=["POST"])
def ping_host():
    body = request.get_json(silent=True) or {}
    target = str(body.get("target", "")).strip()
    count = body.get("count", 4)
    try:
        result = diagnostics_service.run_ping(target=target, count=count)
        return api_success(result, message="Ping test completed.")
    except ValueError as exc:
        return api_error(str(exc), 400, "INVALID_INPUT")
    except RuntimeError as exc:
        return api_error(str(exc), 501, "OS_UNSUPPORTED")
    except Exception as exc:
        return api_error(f"Ping failed: {exc}", 500, "PING_ERROR")


@diagnostics_bp.route("/traceroute", methods=["POST"])
def traceroute_host():
    body = request.get_json(silent=True) or {}
    target = str(body.get("target", "")).strip()
    max_hops = body.get("max_hops", 15)
    try:
        result = diagnostics_service.run_traceroute(target=target, max_hops=max_hops)
        return api_success(result, message="Traceroute completed.")
    except ValueError as exc:
        return api_error(str(exc), 400, "INVALID_INPUT")
    except RuntimeError as exc:
        return api_error(str(exc), 501, "OS_UNSUPPORTED")
    except Exception as exc:
        return api_error(f"Traceroute failed: {exc}", 500, "TRACEROUTE_ERROR")


@diagnostics_bp.route("/dns", methods=["POST"])
def dns_lookup():
    body = request.get_json(silent=True) or {}
    domain = str(body.get("domain", body.get("target", ""))).strip()
    try:
        result = diagnostics_service.run_dns_lookup(domain=domain)
        return api_success(result, message="DNS lookup completed.")
    except ValueError as exc:
        return api_error(str(exc), 400, "INVALID_INPUT")
    except Exception as exc:
        return api_error(f"DNS lookup failed: {exc}", 500, "DNS_ERROR")


@diagnostics_bp.route("/connectivity", methods=["POST"])
def connectivity_test():
    body = request.get_json(silent=True) or {}
    targets = body.get("targets")
    if targets is not None and not isinstance(targets, list):
        return api_error("Targets must be a list of hostnames or IPs.", 400, "INVALID_INPUT")
    try:
        result = diagnostics_service.run_connectivity_test(targets=targets)
        return api_success(result, message="Connectivity test completed.")
    except Exception as exc:
        return api_error(f"Connectivity test failed: {exc}", 500, "CONNECTIVITY_ERROR")


@diagnostics_bp.route("/history", methods=["GET"])
def get_diagnostics_history():
    test_type = request.args.get("type", "").strip() or None
    try:
        limit = int(request.args.get("limit", 30))
    except ValueError:
        limit = 30
    items = diagnostics_service.list_diagnostics_history(limit=limit, test_type=test_type)
    return api_success({"history": items, "total": len(items)})

