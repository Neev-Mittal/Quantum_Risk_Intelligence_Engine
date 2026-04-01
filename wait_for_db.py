"""
Wait until the configured PostgreSQL instance accepts connections.
"""

from __future__ import annotations

import os
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv(override=True)


_TRUTHY = {"1", "true", "yes", "on"}
SQLITE_FALLBACK_EXIT_CODE = 10


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in _TRUTHY


def _should_allow_sqlite_fallback() -> bool:
    raw_value = os.getenv("ALLOW_SQLITE_FALLBACK")
    if raw_value is not None and raw_value.strip():
        return raw_value.strip().lower() in _TRUTHY

    db_host = os.getenv("DB_HOST", "127.0.0.1").strip().lower()
    return db_host in {"127.0.0.1", "localhost", "::1"}


def _return_sqlite_fallback(message: str, *, include_stale_volume_hint: bool = False) -> int:
    print(message)
    if include_stale_volume_hint:
        print(
            "Hint: the configured PostgreSQL credentials do not match the running database. "
            "If you are using the local demo Docker database, recreate it with "
            "`docker compose down -v` from the repo root and start again."
        )
    else:
        print("START_SIMPLE.bat will launch the backend APIs in SQLite mode for this session.")
    return SQLITE_FALLBACK_EXIT_CODE


def main() -> int:
    if _env_flag("USE_SQLITE"):
        print("USE_SQLITE=true is enabled; skipping PostgreSQL readiness wait.")
        return 0

    deadline = time.time() + int(os.getenv("DB_READY_TIMEOUT_SECONDS", "90"))
    last_error = None

    while time.time() < deadline:
        try:
            connection = psycopg2.connect(
                host=os.getenv("DB_HOST", "127.0.0.1"),
                port=os.getenv("DB_PORT", "5432"),
                dbname=os.getenv("DB_NAME", "qrie_platform"),
                user=os.getenv("DB_USER", "qrie_app"),
                password=os.getenv("DB_PASSWORD", ""),
                sslmode=os.getenv("DB_SSL_MODE", "require"),
            )
            connection.close()
            print("PostgreSQL is ready.")
            return 0
        except Exception as exc:  # pragma: no cover - operational helper
            last_error = exc
            if _should_allow_sqlite_fallback() and "password authentication failed" in str(exc).lower():
                return _return_sqlite_fallback(
                    "PostgreSQL credentials were rejected; continuing with local SQLite fallback.",
                    include_stale_volume_hint=True,
                )
            print("Waiting for PostgreSQL to accept connections...")
            time.sleep(2)

    if _should_allow_sqlite_fallback():
        return _return_sqlite_fallback(
            f"Timed out waiting for PostgreSQL ({last_error}). Continuing with local SQLite fallback."
        )

    print(f"Timed out waiting for PostgreSQL: {last_error}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
