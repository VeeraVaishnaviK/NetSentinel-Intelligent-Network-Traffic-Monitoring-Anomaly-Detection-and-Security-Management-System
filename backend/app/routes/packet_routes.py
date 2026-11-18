"""Packet capture control, filtering, and statistics routes."""

from flask import Blueprint, request

from app.services import packet_service
from app.utils.responses import api_error, api_success
from app.utils.validators import validate_port

packet_bp = Blueprint("packets", __name__, url_prefix="/api/packets")


@packet_bp.route("/start", methods=["POST"])
def start_packet_capture():
    body = request.get_json(silent=True) or {}
    interface_name = str(body.get("interface", "")).strip()

    data, err, status_code = packet_service.start_capture(interface_name=interface_name)
    if err:
        return api_error(
            err,
            status_code=status_code,
            code="CAPTURE_PERMISSION_DENIED" if status_code == 403 else "CAPTURE_ERROR",
            details=data,
        )
    return api_success(data, message="Live packet capture started.")


@packet_bp.route("/stop", methods=["POST"])
def stop_packet_capture():
    status = packet_service.stop_capture()
    return api_success(status, message="Packet capture stopped.")


@packet_bp.route("", methods=["GET"])
def get_packets():
    protocol = request.args.get("protocol", "").strip() or None
    ip = request.args.get("ip", "").strip() or None
    src_ip = request.args.get("src_ip", "").strip() or None
    dst_ip = request.args.get("dst_ip", "").strip() or None
    port_raw = request.args.get("port", "").strip()

    port = validate_port(port_raw)
    if port is False:
        return api_error("Invalid port number. Must be between 0 and 65535.", 400, "INVALID_PORT")

    try:
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
    except ValueError:
        return api_error("Invalid pagination parameters.", 400, "INVALID_PARAMS")

    result = packet_service.query_packets(
        protocol=protocol,
        ip=ip,
        src_ip=src_ip,
        dst_ip=dst_ip,
        port=port,
        limit=limit,
        offset=offset,
    )
    return api_success(result)


@packet_bp.route("/stats", methods=["GET"])
def get_packets_stats():
    return api_success(packet_service.get_packet_stats())

