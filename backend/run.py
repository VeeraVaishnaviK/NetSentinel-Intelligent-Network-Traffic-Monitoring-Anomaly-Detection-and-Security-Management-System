"""
NetSentinel Backend Entry Point.

Runs the local Flask REST API server on http://127.0.0.1:5000.
"""

import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app

app = create_app(start_sampler=True)

if __name__ == "__main__":
    host = os.environ.get("NETSENTINEL_HOST", "127.0.0.1")
    port = int(os.environ.get("NETSENTINEL_PORT", "5000"))
    print(f"=======================================================")
    print(f" NetSentinel Backend API running on http://{host}:{port}")
    print(f"=======================================================")
    app.run(host=host, port=port, debug=False, threaded=True)

