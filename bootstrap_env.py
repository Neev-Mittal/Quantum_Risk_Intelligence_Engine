"""
Create or repair the local .env file with secure development defaults.
"""

from __future__ import annotations

import secrets
import socket
from pathlib import Path

import psycopg2
from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
PORT_CANDIDATES = [5432, 5433, 5434, 5435, 55432]


def parse_env_file(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def is_port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) != 0


def can_connect(values: dict[str, str], port: int) -> bool:
    try:
        connection = psycopg2.connect(
            host=values.get("DB_HOST", "127.0.0.1"),
            port=port,
            dbname=values.get("DB_NAME", "qrie_platform"),
            user=values.get("DB_USER", "qrie_app"),
            password=values.get("DB_PASSWORD", ""),
            sslmode=values.get("DB_SSL_MODE", "require"),
            connect_timeout=2,
        )
        connection.close()
        return True
    except Exception:
        return False


def select_db_port(values: dict[str, str]) -> tuple[str, bool]:
    host = values.get("DB_HOST", "127.0.0.1")
    requested = int(values.get("DB_PORT", "5432"))

    if can_connect(values, requested):
        return str(requested), False

    if is_port_free(host, requested):
        return str(requested), False

    for candidate in PORT_CANDIDATES:
        if candidate == requested:
            continue
        if is_port_free(host, candidate):
            return str(candidate), True

    raise RuntimeError("No free local PostgreSQL port was found for the QRIE Docker database.")


def build_env(existing: dict[str, str]) -> tuple[dict[str, str], bool]:
    db_password = existing.get("DB_PASSWORD") or existing.get("POSTGRES_PASSWORD") or secrets.token_urlsafe(24)
    pgadmin_password = existing.get("PGADMIN_DEFAULT_PASSWORD") or secrets.token_urlsafe(24)
    field_key = existing.get("FIELD_ENCRYPTION_KEY") or Fernet.generate_key().decode("utf-8")

    values = {
        "VITE_API_BASE_URL": existing.get("VITE_API_BASE_URL", ""),
        "VITE_DATA_API_BASE_URL": existing.get("VITE_DATA_API_BASE_URL", "/api"),
        "VITE_PORT": existing.get("VITE_PORT", "5173"),
        "CORS_ORIGINS": existing.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173,http://localhost:3000"),
        "SCANNER_API_PORT": existing.get("SCANNER_API_PORT", "8000"),
        "DATABASE_API_PORT": existing.get("DATABASE_API_PORT", "8001"),
        "REPORT_API_PORT": existing.get("REPORT_API_PORT", "8002"),
        "DB_HOST": existing.get("DB_HOST", "127.0.0.1"),
        "DB_PORT": existing.get("DB_PORT", "5432"),
        "DB_NAME": existing.get("DB_NAME", "qrie_platform"),
        "DB_USER": existing.get("DB_USER", "qrie_app"),
        "DB_PASSWORD": db_password,
        "DB_SSL_MODE": existing.get("DB_SSL_MODE", "require"),
        "DB_ECHO": existing.get("DB_ECHO", "false"),
        "USE_SQLITE": existing.get("USE_SQLITE", "false"),
        "SQLITE_PATH": existing.get("SQLITE_PATH", ".local/qrie_local.sqlite3"),
        "ALLOW_SQLITE_FALLBACK": existing.get("ALLOW_SQLITE_FALLBACK", "true"),
        "POSTGRES_DB": existing.get("POSTGRES_DB", existing.get("DB_NAME", "qrie_platform")),
        "POSTGRES_USER": existing.get("POSTGRES_USER", existing.get("DB_USER", "qrie_app")),
        "POSTGRES_PASSWORD": existing.get("POSTGRES_PASSWORD", db_password),
        "FIELD_ENCRYPTION_KEY": field_key,
        "PGADMIN_DEFAULT_EMAIL": existing.get("PGADMIN_DEFAULT_EMAIL", "admin@example.com"),
        "PGADMIN_DEFAULT_PASSWORD": pgadmin_password,
        "ALLOW_INTERNAL_SCAN": existing.get("ALLOW_INTERNAL_SCAN", "false"),
        "RATE_LIMIT_MAX": existing.get("RATE_LIMIT_MAX", "10"),
        "RATE_LIMIT_WINDOW": existing.get("RATE_LIMIT_WINDOW", "60"),
        "NVIDIA_API_KEY": existing.get("NVIDIA_API_KEY", ""),
        "NVIDIA_CHAT_MODEL": existing.get("NVIDIA_CHAT_MODEL", "nvidia/llama-3.1-nemotron-nano-8b-v1"),
        "NVIDIA_API_URL": existing.get("NVIDIA_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions"),
    }

    selected_port, changed = select_db_port(values)
    values["DB_PORT"] = selected_port
    return values, changed


def write_env(path: Path, values: dict[str, str]) -> None:
    lines = [
        "# Auto-generated local environment for QRIE",
        "# You can edit these values later if needed.",
        "",
    ]
    lines.extend(f"{key}={value}" for key, value in values.items())
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    existing = parse_env_file(ENV_PATH)
    values, port_changed = build_env(existing)
    write_env(ENV_PATH, values)

    if existing:
        print(f"Updated {ENV_PATH.name} with any missing secure defaults.")
    else:
        print(f"Created {ENV_PATH.name} with generated local secrets.")

    if port_changed:
        print(f"Selected alternate PostgreSQL port {values['DB_PORT']} because the previous port was already in use.")
    else:
        print(f"Using PostgreSQL port {values['DB_PORT']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
