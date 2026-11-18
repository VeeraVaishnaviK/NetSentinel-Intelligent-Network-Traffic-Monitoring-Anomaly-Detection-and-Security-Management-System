"""
NetSentinel Flask Application Factory.
"""

from flask import Flask
from flask_cors import CORS

from app.database import init_db
from app.routes.device_routes import device_bp
from app.routes.diagnostics_routes import diagnostics_bp
from app.routes.network_routes import network_bp
from app.routes.packet_routes import packet_bp
from app.routes.report_routes import report_bp
from app.routes.security_routes import security_bp
from app.routes.settings_routes import settings_bp
from app.routes.traffic_routes import traffic_bp
from app.services import traffic_service
from app.utils.responses import api_error, api_success


def create_app(start_sampler: bool = True) -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    init_db()

    # Register API blueprints
    app.register_blueprint(network_bp)
    app.register_blueprint(packet_bp)
    app.register_blueprint(traffic_bp)
    app.register_blueprint(security_bp)
    app.register_blueprint(device_bp)
    app.register_blueprint(diagnostics_bp)
    app.register_blueprint(report_bp)
    app.register_blueprint(settings_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        return api_success({"status": "ok", "service": "NetSentinel API"})

    @app.errorhandler(404)
    def handle_404(_err):
        return api_error("Requested API endpoint not found.", 404, "NOT_FOUND")

    @app.errorhandler(405)
    def handle_405(_err):
        return api_error("HTTP method not allowed for this endpoint.", 405, "METHOD_NOT_ALLOWED")

    @app.errorhandler(500)
    def handle_500(err):
        return api_error(f"Internal server error: {err}", 500, "INTERNAL_ERROR")

    if start_sampler:
        traffic_service.start_background_sampler()

    return app
