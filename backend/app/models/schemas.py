"""
Row-to-dict serializers for SQLite query results.
"""

import json


def serialize_device(row) -> dict:
    return {
        "id": row["id"],
        "ip_address": row["ip_address"],
        "mac_address": row["mac_address"] or "",
        "hostname": row["hostname"] or "",
        "interface_name": row["interface_name"] or "",
        "status": row["status"],
        "is_new": bool(row["is_new"]),
        "bytes_sent": row["bytes_sent"],
        "bytes_received": row["bytes_received"],
        "total_bytes": (row["bytes_sent"] or 0) + (row["bytes_received"] or 0),
        "packet_count": row["packet_count"],
        "first_discovered": row["first_discovered"],
        "last_seen": row["last_seen"],
        "is_demo": bool(row["is_demo"]),
        "is_trusted": bool(row["trusted_id"]) if "trusted_id" in row.keys() else False,
        "trusted_id": row["trusted_id"] if "trusted_id" in row.keys() else None,
        "description": row["trusted_description"] if "trusted_description" in row.keys() and row["trusted_description"] else "",
    }


def serialize_packet(row) -> dict:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "timestamp": row["timestamp"],
        "src_ip": row["src_ip"],
        "dst_ip": row["dst_ip"],
        "src_port": row["src_port"],
        "dst_port": row["dst_port"],
        "protocol": row["protocol"],
        "length": row["length"],
        "tcp_flags": row["tcp_flags"] or "",
        "dns_query": row["dns_query"] or "",
        "http_info": row["http_info"] or "",
        "summary": row["summary"] or "",
        "direction": row["direction"] or "local",
        "is_demo": bool(row["is_demo"]),
    }


def serialize_alert(row) -> dict:
    try:
        details = json.loads(row["details_json"] or "{}")
    except (ValueError, TypeError):
        details = {}
    return {
        "id": row["id"],
        "alert_code": row["alert_code"],
        "rule_type": row["rule_type"],
        "title": row["title"],
        "severity": row["severity"],
        "src_ip": row["src_ip"] or "",
        "dst_ip": row["dst_ip"] or "",
        "detected_at": row["detected_at"],
        "reason": row["reason"],
        "recommended_action": row["recommended_action"],
        "status": row["status"],
        "details": details,
        "is_demo": bool(row["is_demo"]),
    }


def serialize_diagnostic(row) -> dict:
    try:
        result = json.loads(row["result_json"] or "{}")
    except (ValueError, TypeError):
        result = {}
    return {
        "id": row["id"],
        "test_type": row["test_type"],
        "target": row["target"],
        "status": row["status"],
        "summary": row["summary"] or "",
        "result": result,
        "executed_at": row["executed_at"],
    }
