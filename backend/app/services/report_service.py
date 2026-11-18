"""
Report Aggregation, CSV Export, and Professional PDF Report Generation Service.

Uses ReportLab to generate clean multi-section PDF reports with KPI summary
cards, protocol bar charts, and structured tables.
"""

import csv
import io
from datetime import datetime, timedelta, timezone

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.database import get_all_settings, get_connection, utc_now_iso
from app.models.schemas import serialize_alert, serialize_device, serialize_diagnostic
from app.services import network_service


def _normalize_date_range(start_date: str = None, end_date: str = None) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    if not end_date:
        end_iso = now.strftime("%Y-%m-%dT23:59:59Z")
    elif len(end_date) == 10:
        end_iso = f"{end_date}T23:59:59Z"
    else:
        end_iso = end_date

    if not start_date:
        start_iso = (now - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00Z")
    elif len(start_date) == 10:
        start_iso = f"{start_date}T00:00:00Z"
    else:
        start_iso = start_date

    return start_iso, end_iso


def _format_bytes(num_bytes: float) -> str:
    val = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(val) < 1024.0:
            return f"{val:.2f} {unit}"
        val /= 1024.0
    return f"{val:.2f} PB"


def build_report_summary(start_date: str = None, end_date: str = None) -> dict:
    """Aggregate all report sections within the requested date range."""
    start_iso, end_iso = _normalize_date_range(start_date, end_date)
    settings = get_all_settings()
    demo_mode = settings.get("demo_mode", False)
    demo_filter = "" if demo_mode else "AND is_demo = 0"
    pref_iface = network_service.get_preferred_interface()
    selected_interface = settings.get("default_interface") or (pref_iface["name"] if pref_iface else "N/A")

    conn = get_connection()
    try:
        # Devices
        dev_rows = conn.execute(
            f"""
            SELECT d.*, t.id AS trusted_id, t.description AS trusted_description
            FROM devices d
            LEFT JOIN trusted_devices t ON t.ip_address = d.ip_address
            WHERE d.last_seen >= ? AND d.last_seen <= ?
            {'AND d.is_demo = 0' if not demo_mode else ''}
            ORDER BY d.last_seen DESC
            """,
            (start_iso, end_iso),
        ).fetchall()
        devices = [serialize_device(r) for r in dev_rows]

        # Packets & Protocols
        pkt_totals = conn.execute(
            f"""
            SELECT COUNT(*) as total_packets, COALESCE(SUM(length), 0) as total_bytes
            FROM captured_packets
            WHERE timestamp >= ? AND timestamp <= ? {demo_filter}
            """,
            (start_iso, end_iso),
        ).fetchone()

        proto_rows = conn.execute(
            f"""
            SELECT protocol, COUNT(*) as count, COALESCE(SUM(length), 0) as bytes
            FROM captured_packets
            WHERE timestamp >= ? AND timestamp <= ? {demo_filter}
            GROUP BY protocol
            ORDER BY count DESC
            """,
            (start_iso, end_iso),
        ).fetchall()

        total_packets = pkt_totals["total_packets"]
        protocols = [
            {
                "protocol": r["protocol"],
                "count": r["count"],
                "bytes": r["bytes"],
                "percentage": round((r["count"] / total_packets) * 100, 1) if total_packets > 0 else 0.0,
            }
            for r in proto_rows
        ]

        # Traffic Statistics
        traffic_agg = conn.execute(
            f"""
            SELECT COUNT(*) as samples,
                   COALESCE(SUM(bytes_recv_delta), 0) as total_recv_bytes,
                   COALESCE(SUM(bytes_sent_delta), 0) as total_sent_bytes,
                   COALESCE(AVG(download_bps), 0) as avg_download_bps,
                   COALESCE(AVG(upload_bps), 0) as avg_upload_bps,
                   COALESCE(MAX(download_bps), 0) as peak_download_bps,
                   COALESCE(MAX(upload_bps), 0) as peak_upload_bps,
                   COALESCE(AVG(packets_per_sec), 0) as avg_pps
            FROM traffic_statistics
            WHERE timestamp >= ? AND timestamp <= ? {demo_filter}
            """,
            (start_iso, end_iso),
        ).fetchone()

        # Security Alerts
        alert_rows = conn.execute(
            f"""
            SELECT * FROM security_alerts
            WHERE detected_at >= ? AND detected_at <= ? {demo_filter}
            ORDER BY detected_at DESC
            LIMIT 100
            """,
            (start_iso, end_iso),
        ).fetchall()
        alerts = [serialize_alert(r) for r in alert_rows]

        alert_by_sev = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for a in alerts:
            if a["severity"] in alert_by_sev:
                alert_by_sev[a["severity"]] += 1

        # Diagnostics
        diag_rows = conn.execute(
            """
            SELECT * FROM diagnostics_history
            WHERE executed_at >= ? AND executed_at <= ?
            ORDER BY executed_at DESC
            LIMIT 50
            """,
            (start_iso, end_iso),
        ).fetchall()
        diagnostics = [serialize_diagnostic(r) for r in diag_rows]

        # Monitoring sessions
        sessions = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT * FROM monitoring_sessions
                WHERE started_at >= ? AND started_at <= ? {demo_filter}
                ORDER BY started_at DESC
                LIMIT 20
                """,
                (start_iso, end_iso),
            ).fetchall()
        ]

        return {
            "generated_at": utc_now_iso(),
            "monitoring_period": {
                "start": start_iso,
                "end": end_iso,
            },
            "selected_interface": selected_interface,
            "demo_mode_included": demo_mode,
            "summary": {
                "discovered_devices": len(devices),
                "online_devices": sum(1 for d in devices if d["status"] == "online"),
                "trusted_devices": sum(1 for d in devices if d["is_trusted"]),
                "total_packets_captured": total_packets,
                "captured_bytes": pkt_totals["total_bytes"],
                "total_alerts": len(alerts),
                "open_alerts": sum(1 for a in alerts if a["status"] == "open"),
                "alerts_by_severity": alert_by_sev,
                "diagnostics_run": len(diagnostics),
                "monitoring_sessions": len(sessions),
            },
            "traffic_statistics": {
                "samples": traffic_agg["samples"],
                "total_recv_bytes": traffic_agg["total_recv_bytes"],
                "total_sent_bytes": traffic_agg["total_sent_bytes"],
                "avg_download_bps": round(traffic_agg["avg_download_bps"], 2),
                "avg_upload_bps": round(traffic_agg["avg_upload_bps"], 2),
                "peak_download_bps": round(traffic_agg["peak_download_bps"], 2),
                "peak_upload_bps": round(traffic_agg["peak_upload_bps"], 2),
                "avg_pps": round(traffic_agg["avg_pps"], 2),
            },
            "protocols": protocols,
            "devices": devices,
            "alerts": alerts,
            "diagnostics": diagnostics,
            "sessions": sessions,
        }
    finally:
        conn.close()


def generate_csv_report(start_date: str = None, end_date: str = None, section: str = "full") -> str:
    """Generate a downloadable CSV string for the full report or a single section (e.g. devices)."""
    data = build_report_summary(start_date, end_date)
    buf = io.StringIO()
    writer = csv.writer(buf)

    if section == "devices":
        writer.writerow([
            "Device IP", "MAC Address", "Hostname", "Status", "Trusted",
            "First Discovered", "Last Seen", "Bytes Sent", "Bytes Received", "Packets"
        ])
        for d in data["devices"]:
            writer.writerow([
                d["ip_address"], d["mac_address"], d["hostname"], d["status"],
                "Yes" if d["is_trusted"] else "No", d["first_discovered"], d["last_seen"],
                d["bytes_sent"], d["bytes_received"], d["packet_count"]
            ])
        return buf.getvalue()

    # Full multi-section report CSV
    writer.writerow(["NetSentinel Network Monitoring & Security Report"])
    writer.writerow(["Generated At (UTC)", data["generated_at"]])
    writer.writerow(["Monitoring Period", f"{data['monitoring_period']['start']} to {data['monitoring_period']['end']}"])
    writer.writerow(["Selected Interface", data["selected_interface"]])
    writer.writerow(["Includes Demo Data", "Yes" if data["demo_mode_included"] else "No"])
    writer.writerow([])

    writer.writerow(["=== SUMMARY STATISTICS ==="])
    s = data["summary"]
    t = data["traffic_statistics"]
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Discovered Devices", s["discovered_devices"]])
    writer.writerow(["Online Devices", s["online_devices"]])
    writer.writerow(["Trusted Devices", s["trusted_devices"]])
    writer.writerow(["Total Packets Captured", s["total_packets_captured"]])
    writer.writerow(["Captured Payload Metadata Bytes", s["captured_bytes"]])
    writer.writerow(["Interface Incoming Bytes (Period)", t["total_recv_bytes"]])
    writer.writerow(["Interface Outgoing Bytes (Period)", t["total_sent_bytes"]])
    writer.writerow(["Avg Download Speed (B/s)", t["avg_download_bps"]])
    writer.writerow(["Avg Upload Speed (B/s)", t["avg_upload_bps"]])
    writer.writerow(["Total Security Alerts", s["total_alerts"]])
    writer.writerow(["Open Security Alerts", s["open_alerts"]])
    writer.writerow(["Diagnostics Tests Run", s["diagnostics_run"]])
    writer.writerow([])

    writer.writerow(["=== PROTOCOL DISTRIBUTION ==="])
    writer.writerow(["Protocol", "Packet Count", "Bytes", "Percentage (%)"])
    for p in data["protocols"]:
        writer.writerow([p["protocol"], p["count"], p["bytes"], p["percentage"]])
    writer.writerow([])

    writer.writerow(["=== DISCOVERED DEVICES ==="])
    writer.writerow(["IP Address", "MAC Address", "Hostname", "Status", "Trusted", "First Discovered", "Last Seen"])
    for d in data["devices"]:
        writer.writerow([
            d["ip_address"], d["mac_address"], d["hostname"], d["status"],
            "Yes" if d["is_trusted"] else "No", d["first_discovered"], d["last_seen"]
        ])
    writer.writerow([])

    writer.writerow(["=== SECURITY ALERTS ==="])
    writer.writerow(["Alert Code", "Severity", "Title", "Source IP", "Destination IP", "Status", "Detected At", "Reason"])
    for a in data["alerts"]:
        writer.writerow([
            a["alert_code"], a["severity"], a["title"], a["src_ip"],
            a["dst_ip"], a["status"], a["detected_at"], a["reason"]
        ])
    writer.writerow([])

    writer.writerow(["=== NETWORK DIAGNOSTICS ==="])
    writer.writerow(["Test Type", "Target", "Status", "Summary", "Executed At"])
    for dg in data["diagnostics"]:
        writer.writerow([dg["test_type"], dg["target"], dg["status"], dg["summary"], dg["executed_at"]])

    return buf.getvalue()


def _build_protocol_chart(protocols: list[dict]) -> Drawing | None:
    if not protocols:
        return None
    top = protocols[:6]
    drawing = Drawing(460, 150)
    drawing.add(
        String(0, 136, "Protocol Distribution (Captured Packets)", fontName="Helvetica-Bold", fontSize=10, fillColor=colors.HexColor("#0f172a"))
    )
    chart = HorizontalBarChart()
    chart.x = 65
    chart.y = 15
    chart.height = 110
    chart.width = 370
    chart.data = [[p["count"] for p in top]]
    chart.categoryAxis.categoryNames = [p["protocol"] for p in top]
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 8
    chart.bars[0].fillColor = colors.HexColor("#0284c7")
    drawing.add(chart)
    return drawing


def generate_pdf_report(start_date: str = None, end_date: str = None) -> bytes:
    """Generate a professionally formatted NetSentinel PDF report and return bytes."""
    data = build_report_summary(start_date, end_date)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="NetSentinel Network Security & Traffic Report",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "NSTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "NSSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14,
    )
    section_style = ParagraphStyle(
        "NSSection",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#0369a1"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "NSBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=colors.HexColor("#1e293b"),
        leading=12,
    )

    elements = []
    elements.append(Paragraph("NetSentinel — Network Monitoring & Security Report", title_style))
    meta_text = (
        f"Generated: {data['generated_at']} &nbsp;|&nbsp; "
        f"Period: {data['monitoring_period']['start'][:10]} to {data['monitoring_period']['end'][:10]} &nbsp;|&nbsp; "
        f"Interface: {data['selected_interface']}"
    )
    if data["demo_mode_included"]:
        meta_text += " &nbsp;|&nbsp; <b>[INCLUDES DEMO MODE DATA]</b>"
    elements.append(Paragraph(meta_text, subtitle_style))

    # KPI Summary Table
    s = data["summary"]
    t = data["traffic_statistics"]
    kpi_data = [
        ["Discovered Devices", "Total Packets Captured", "Interface Traffic (In / Out)", "Security Alerts (Open)"],
        [
            f"{s['discovered_devices']} ({s['online_devices']} online)",
            f"{s['total_packets_captured']:,}",
            f"{_format_bytes(t['total_recv_bytes'])} / {_format_bytes(t['total_sent_bytes'])}",
            f"{s['total_alerts']} ({s['open_alerts']} open)",
        ],
        ["Trusted Devices", "Avg Download / Upload", "Peak Download / Upload", "Diagnostics Executed"],
        [
            str(s["trusted_devices"]),
            f"{_format_bytes(t['avg_download_bps'])}/s / {_format_bytes(t['avg_upload_bps'])}/s",
            f"{_format_bytes(t['peak_download_bps'])}/s / {_format_bytes(t['peak_upload_bps'])}/s",
            str(s["diagnostics_run"]),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[1.75 * inch] * 4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.white),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f8fafc")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 10))

    # Protocol Distribution Section + Chart
    elements.append(Paragraph("1. Protocol Distribution", section_style))
    if data["protocols"]:
        chart = _build_protocol_chart(data["protocols"])
        if chart:
            elements.append(chart)
            elements.append(Spacer(1, 6))
        proto_rows = [["Protocol", "Packets", "Total Bytes", "Share (%)"]]
        for p in data["protocols"]:
            proto_rows.append([p["protocol"], f"{p['count']:,}", _format_bytes(p["bytes"]), f"{p['percentage']}%"])
        ptable = Table(proto_rows, colWidths=[1.6 * inch, 1.5 * inch, 2.0 * inch, 1.9 * inch])
        ptable.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(ptable)
    else:
        elements.append(Paragraph("No captured packets recorded in the selected monitoring period.", body_style))

    # Discovered Devices Section
    elements.append(Paragraph("2. Discovered Local Network Devices", section_style))
    if data["devices"]:
        dev_rows = [["IP Address", "MAC Address", "Hostname", "Status", "Trust", "Last Seen"]]
        for d in data["devices"][:25]:
            dev_rows.append([
                d["ip_address"],
                d["mac_address"] or "-",
                (d["hostname"] or "-")[:22],
                d["status"].upper(),
                "Trusted" if d["is_trusted"] else "Unapproved",
                d["last_seen"][:19].replace("T", " "),
            ])
        dtable = Table(dev_rows, colWidths=[1.15 * inch, 1.3 * inch, 1.35 * inch, 0.7 * inch, 0.9 * inch, 1.6 * inch])
        dtable.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(dtable)
    else:
        elements.append(Paragraph("No devices recorded in the selected period.", body_style))

    # Security Alerts Section
    elements.append(Paragraph("3. Security Center Alerts", section_style))
    elements.append(Paragraph(
        "<i>Note: Rule-based alerts indicate suspicious network patterns for investigation and are not definitive proof of malicious activity.</i>",
        body_style,
    ))
    elements.append(Spacer(1, 4))
    if data["alerts"]:
        alert_rows = [["Code", "Severity", "Alert Title", "Source IP", "Status", "Detected"]]
        for a in data["alerts"][:25]:
            alert_rows.append([
                a["alert_code"],
                a["severity"],
                a["title"][:36],
                a["src_ip"] or "-",
                a["status"].upper(),
                a["detected_at"][:19].replace("T", " "),
            ])
        atable = Table(alert_rows, colWidths=[1.05 * inch, 0.75 * inch, 2.2 * inch, 1.0 * inch, 0.85 * inch, 1.15 * inch])
        atable.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(atable)
    else:
        elements.append(Paragraph("No security alerts recorded in the selected period.", body_style))

    # Diagnostics Section
    elements.append(Paragraph("4. Network Diagnostics History", section_style))
    if data["diagnostics"]:
        diag_rows = [["Type", "Target", "Status", "Summary", "Executed"]]
        for dg in data["diagnostics"][:20]:
            diag_rows.append([
                dg["test_type"].upper(),
                dg["target"][:22],
                dg["status"].upper(),
                dg["summary"][:42],
                dg["executed_at"][:19].replace("T", " "),
            ])
        dgtable = Table(diag_rows, colWidths=[0.85 * inch, 1.3 * inch, 0.75 * inch, 2.75 * inch, 1.35 * inch])
        dgtable.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(dgtable)
    else:
        elements.append(Paragraph("No network diagnostics executed in the selected period.", body_style))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

