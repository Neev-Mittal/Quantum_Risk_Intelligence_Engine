"""
Legacy compatibility entrypoint.

Historically the project used data_api.py for JSON-backed endpoints. The active
implementation now lives in database_api.py and serves data from PostgreSQL.
"""

from __future__ import annotations

import os

from database_api import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "database_api:app",
        host="0.0.0.0",
        port=int(os.getenv("DATABASE_API_PORT", "8001")),
        reload=False,
    )
