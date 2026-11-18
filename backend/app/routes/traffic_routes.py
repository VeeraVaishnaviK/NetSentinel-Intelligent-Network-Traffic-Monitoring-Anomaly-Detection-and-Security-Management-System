"""Network traffic analytics routes."""

from flask import Blueprint, request

from app.services import traffic_service
from app.utils.responses import api_success

traffic_bp = Blueprint("traffic", __name__, url_prefix="/api/traffic")


@traffic_bp.route("/current", methods=["GET"])
def get_current_traffic():
    interface_name = request.args.get("interface", "").strip()
    return api_success(traffic_service.get_current_traffic(interface_name=interface_name))


@traffic_bp.route("/history", methods=["GET"])
def get_traffic_history():
    range_key = request.args.get("range", "15m").strip()
    interface_name = request.args.get("interface", "").strip()
    return api_success(traffic_service.get_traffic_history(range_key=range_key, interface_name=interface_name))


@traffic_bp.route("/protocols", methods=["GET"])
def get_traffic_protocols():
    return api_success(traffic_service.get_protocol_and_device_analytics())

