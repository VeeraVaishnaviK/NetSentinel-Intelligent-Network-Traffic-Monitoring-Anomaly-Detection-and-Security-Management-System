"""Report summary, CSV export, and PDF export routes."""

from datetime import datetime, timezone

from flask import Blueprint, Response, request

from app.services import report_service
from app.utils.responses import api_error, api_success
from app.utils.validators import parse_iso_date

report_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _extract_dates():
    start_date = request.args.get("start_date", "").strip() or None
    end_date = request.args.get("end_date", "").strip() or None
    if start_date and not parse_iso_date(start_date):
        return None, None, "Invalid start_date format. Use YYYY-MM-DD."
    if end_date and not parse_iso_date(end_date):
        return None, None, "Invalid end_date format. Use YYYY-MM-DD."
    return start_date, end_date, None


@report_bp.route("/summary", methods=["GET"])
def get_report_summary():
    start_date, end_date, err = _extract_dates()
    if err:
        return api_error(err, 400, "INVALID_DATE")
    data = report_service.build_report_summary(start_date=start_date, end_date=end_date)
    return api_success(data)


@report_bp.route("/export/csv", methods=["GET"])
def export_csv():
    start_date, end_date, err = _extract_dates()
    if err:
        return api_error(err, 400, "INVALID_DATE")
    section = request.args.get("section", "full").strip().lower()
    csv_content = report_service.generate_csv_report(
        start_date=start_date, end_date=end_date, section=section
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"netsentinel_{section}_{stamp}.csv"
    return Response(
        csv_content,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@report_bp.route("/export/pdf", methods=["GET"])
def export_pdf():
    start_date, end_date, err = _extract_dates()
    if err:
        return api_error(err, 400, "INVALID_DATE")
    try:
        pdf_bytes = report_service.generate_pdf_report(start_date=start_date, end_date=end_date)
    except Exception as exc:
        return api_error(f"PDF generation failed: {exc}", 500, "PDF_ERROR")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"netsentinel_report_{stamp}.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

