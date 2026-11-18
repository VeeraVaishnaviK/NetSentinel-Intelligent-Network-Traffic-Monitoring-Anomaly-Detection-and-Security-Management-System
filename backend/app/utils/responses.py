"""
Consistent API response builders for Flask routes.
"""

from flask import jsonify


def api_success(data=None, message: str = "OK", status_code: int = 200, meta: dict = None):
    payload = {
        "success": True,
        "message": message,
        "data": data if data is not None else {},
    }
    if meta:
        payload["meta"] = meta
    return jsonify(payload), status_code


def api_error(message: str, status_code: int = 400, code: str = "BAD_REQUEST", details=None):
    payload = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if details is not None:
        payload["error"]["details"] = details
    return jsonify(payload), status_code
