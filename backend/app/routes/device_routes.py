"""Device management and trusted devices registry routes."""

from flask import Blueprint, request

from app.services import network_service
from app.utils.responses import api_error, api_success
from app.utils.validators import is_valid_ip, is_valid_mac

device_bp = Blueprint("devices", __name__, url_prefix="/api/devices")


@device_bp.route("", methods=["GET"])
def get_devices():
    devices = network_service.list_devices()
    trusted = network_service.list_trusted_devices()
    return api_success({
        "devices": devices,
        "trusted_devices": trusted,
        "summary": {
            "total": len(devices),
            "online": sum(1 for d in devices if d["status"] == "online"),
            "trusted": sum(1 for d in devices if d["is_trusted"]),
            "unapproved": sum(1 for d in devices if not d["is_trusted"]),
        },
    })


@device_bp.route("/trust", methods=["POST"])
def add_trusted_device():
    body = request.get_json(silent=True) or {}
    ip_address = str(body.get("ip_address", "")).strip()
    mac_address = str(body.get("mac_address", "")).strip()
    hostname = str(body.get("hostname", "")).strip()
    description = str(body.get("description", "")).strip()[:200]

    if not is_valid_ip(ip_address):
        return api_error("A valid IPv4/IPv6 address is required.", 400, "INVALID_IP")
    if mac_address and not is_valid_mac(mac_address):
        return api_error("Invalid MAC address format (expected AA:BB:CC:DD:EE:FF).", 400, "INVALID_MAC")

    record = network_service.trust_device(
        ip_address=ip_address,
        mac_address=mac_address,
        hostname=hostname,
        description=description,
    )
    return api_success(record, message=f"Device {ip_address} marked as trusted.", status_code=201)


@device_bp.route("/trust/<int:trusted_id>", methods=["DELETE"])
def remove_trusted_device(trusted_id: int):
    removed = network_service.untrust_device(trusted_id)
    if not removed:
        return api_error(f"Trusted device record #{trusted_id} not found.", 404, "NOT_FOUND")
    return api_success({"deleted_id": trusted_id}, message="Device removed from trusted list.")

