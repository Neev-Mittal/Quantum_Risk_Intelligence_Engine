"""
Shared database models and secure Postgres helpers for the QRIE platform.

The frontend currently depends on the richer "enriched_cbom.json" structure,
so we persist both normalized columns and an encrypted compatibility payload
for each record.
"""

from __future__ import annotations

import enum
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.types import TypeDecorator

load_dotenv(override=True)

Base = declarative_base()

_ENCRYPTOR: Fernet | None = None
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_PATH = _REPO_ROOT / ".local" / "qrie_local.sqlite3"
_SEED_LOCK_PATH = _REPO_ROOT / ".local" / "qrie_seed.lock"
_TRUTHY = {"1", "true", "yes", "on"}
_SQLITE_FALLBACK_NOTIFIED = False


def get_field_encryptor() -> Fernet:
    """Return the Fernet instance used for application-level field encryption."""
    global _ENCRYPTOR

    if _ENCRYPTOR is not None:
        return _ENCRYPTOR

    key = os.getenv("FIELD_ENCRYPTION_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not configured. "
            "Create a local .env or run START_SIMPLE.bat to bootstrap secrets."
        )

    _ENCRYPTOR = Fernet(key.encode("utf-8"))
    return _ENCRYPTOR


class EncryptedJSONType(TypeDecorator):
    """Encrypt JSON payloads before they are stored in Postgres."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        token = get_field_encryptor().encrypt(payload.encode("utf-8"))
        return token.decode("utf-8")

    def process_result_value(self, value: str | None, dialect: Any) -> Any:
        if not value:
            return None
        try:
            decrypted = get_field_encryptor().decrypt(value.encode("utf-8"))
            return json.loads(decrypted.decode("utf-8"))
        except InvalidToken:
            # Gracefully read legacy plaintext rows if they exist.
            return json.loads(value)


class UserRole(str, enum.Enum):
    admin = "admin"
    pnb_checker = "pnb_checker"
    compliance_auditor = "compliance_auditor"
    it_administrator = "it_administrator"


class Asset(Base):
    """TLS / CBOM asset records and their encrypted rich compatibility payload."""

    __tablename__ = "assets"

    id = Column(String(50), primary_key=True)
    fqdn = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), index=True)
    port = Column(Integer, default=443)

    tls_supported = Column(Boolean, default=True)
    supported_tls_versions = Column(JSON)
    min_tls = Column(String(20))
    max_tls = Column(String(20))
    active_tls_version = Column(String(20))

    cipher_suite = Column(String(120))
    key_exchange = Column(String(80))
    encryption = Column(String(80))
    hash_algorithm = Column(String(80))
    public_key_algo = Column(String(80))
    signature_algo = Column(String(120))
    authentication_algorithm = Column(String(120))

    key_size = Column(Integer)
    pfs_enabled = Column(Boolean)

    issuer_ca = Column(String(255))
    subject_cn = Column(String(255))
    cert_not_before = Column(DateTime)
    cert_not_after = Column(DateTime)

    asset_type = Column(String(50), index=True)
    hei_score = Column(Float, default=50.0, index=True)
    mds_score = Column(Float)
    risk_category = Column(String(20), index=True)
    pqc_readiness = Column(String(120), index=True)
    remediation_priority = Column(Float)
    scoring_confidence = Column(String(50))

    http_scheme = Column(String(20))
    http_url = Column(String(500))
    http_status = Column(Integer)
    page_title = Column(String(500))
    web_server = Column(String(255))
    detected_os = Column(String(255))
    os_confidence = Column(String(50))
    body_snippet = Column(Text)
    certification_status = Column(String(80))
    oid_reference = Column(String(255))
    error = Column(Text)
    latency_ms = Column(Float)
    scan_status = Column(String(20), index=True)
    source_index = Column(Integer, index=True)

    record_data = Column(EncryptedJSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    findings = relationship("SecurityFinding", back_populates="asset")
    drift_records = relationship("QuantumDrift", back_populates="asset", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("fqdn", "ip_address", "port", name="uq_asset"),
        Index("idx_asset_fqdn_ip", "fqdn", "ip_address"),
        Index("idx_asset_type_risk", "asset_type", "risk_category"),
    )

    def __repr__(self) -> str:
        return f"<Asset {self.fqdn}:{self.port}>"


class QuantumDrift(Base):
    """Tracks changes in cryptographic posture of assets between scans.

    Each row represents a single field-level change detected when a previously
    existing asset is re-scanned and its cryptographic configuration differs
    from what was stored in the database.
    """

    __tablename__ = "quantum_drift"

    id = Column(Integer, primary_key=True)
    asset_id = Column(String(50), ForeignKey("assets.id"), nullable=False, index=True)
    scan_timestamp = Column(DateTime, nullable=False, index=True)

    # What changed
    drift_type = Column(String(50), nullable=False, index=True)
    severity = Column(String(20), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)

    # HEI / risk context at the time of the drift
    old_hei_score = Column(Float)
    new_hei_score = Column(Float)
    hei_delta = Column(Float)
    old_risk_category = Column(String(20))
    new_risk_category = Column(String(20))

    # Full before/after snapshots for audit
    old_snapshot = Column(EncryptedJSONType, nullable=True)
    new_snapshot = Column(EncryptedJSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    asset = relationship("Asset", back_populates="drift_records")

    __table_args__ = (
        Index("idx_drift_asset_time", "asset_id", "scan_timestamp"),
        Index("idx_drift_type_severity", "drift_type", "severity"),
    )

    def __repr__(self) -> str:
        return f"<QuantumDrift {self.drift_type} on {self.asset_id}>"


class Subdomain(Base):
    """DNS discovery records."""

    __tablename__ = "subdomains"

    id = Column(Integer, primary_key=True)
    fqdn = Column(String(255), nullable=False, unique=True, index=True)
    parent_domain = Column(String(255), index=True)

    ips = Column(JSON)
    status = Column(String(20))
    asset_type = Column(String(50))
    sources = Column(JSON)
    resolved_at = Column(DateTime)
    source_index = Column(Integer, index=True)
    record_data = Column(EncryptedJSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_subdomain_fqdn", "fqdn"),
        Index("idx_subdomain_parent", "parent_domain"),
    )

    def __repr__(self) -> str:
        return f"<Subdomain {self.fqdn}>"


class SecurityFinding(Base):
    """Shadow-crypto / crypto hygiene findings."""

    __tablename__ = "security_findings"

    id = Column(Integer, primary_key=True)
    finding_type = Column(String(50), index=True)
    severity = Column(String(20), index=True)

    asset_id = Column(String(50), ForeignKey("assets.id"), nullable=True)
    fqdn = Column(String(255), index=True)
    ip_address = Column(String(45))
    port = Column(Integer, default=443)

    description = Column(String(1000))
    recommendation = Column(String(1000))
    details = Column(JSON)
    source_index = Column(Integer, index=True)
    record_data = Column(EncryptedJSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    asset = relationship("Asset", back_populates="findings")

    __table_args__ = (
        Index("idx_finding_fqdn_type", "fqdn", "finding_type"),
        Index("idx_finding_severity", "severity"),
    )

    def __repr__(self) -> str:
        return f"<Finding {self.finding_type}@{self.fqdn}>"


class SimulationScenario(Base):
    """Business impact / Q-VaR scenarios."""

    __tablename__ = "simulation_scenarios"

    id = Column(Integer, primary_key=True)

    scenario_name = Column(String(100))
    scenario_type = Column(String(50))

    blast_radius = Column(Integer)
    direct_loss_min = Column(Float)
    direct_loss_max = Column(Float)
    indirect_loss_min = Column(Float)
    indirect_loss_max = Column(Float)

    probability_percent = Column(Float)
    qvar_value = Column(Float)
    recovery_time_hours = Column(Integer)
    downtime_cost_per_hour = Column(Float)

    assumptions = Column(JSON)
    affected_services = Column(JSON)
    source_index = Column(Integer, index=True)
    scenario_data = Column(EncryptedJSONType, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self) -> str:
        return f"<SimulationScenario {self.scenario_name}>"


class ScanMetadata(Base):
    """Metadata about scan or enrichment runs."""

    __tablename__ = "scan_metadata"

    id = Column(Integer, primary_key=True)
    scan_name = Column(String(100), index=True)
    scan_type = Column(String(50))
    target_domain = Column(String(255), index=True)
    target_scope = Column(JSON)
    started_at = Column(DateTime, index=True)
    completed_at = Column(DateTime)
    total_assets_found = Column(Integer)
    total_findings = Column(Integer)
    scan_status = Column(String(20))
    tools_used = Column(JSON)
    config = Column(JSON)

    def __repr__(self) -> str:
        return f"<ScanMetadata {self.scan_name}>"


class DatasetMetadata(Base):
    """Encrypted dataset-wide metadata such as enrichment summaries."""

    __tablename__ = "dataset_metadata"

    id = Column(Integer, primary_key=True)
    dataset_name = Column(String(100), nullable=False, unique=True, index=True)
    payload = Column(EncryptedJSONType, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    def __repr__(self) -> str:
        return f"<DatasetMetadata {self.dataset_name}>"


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in _TRUTHY


def _sqlite_path() -> Path:
    raw_path = os.getenv("SQLITE_PATH", "").strip()
    if raw_path:
        path = Path(raw_path).expanduser()
        if not path.is_absolute():
            path = _REPO_ROOT / path
        return path
    return _DEFAULT_SQLITE_PATH


def _sqlite_url() -> str:
    sqlite_path = _sqlite_path()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{sqlite_path.as_posix()}"


def _should_allow_sqlite_fallback() -> bool:
    raw_value = os.getenv("ALLOW_SQLITE_FALLBACK")
    if raw_value is not None and raw_value.strip():
        return raw_value.strip().lower() in _TRUTHY

    if os.getenv("DATABASE_URL", "").strip():
        return False

    db_host = os.getenv("DB_HOST", "127.0.0.1").strip().lower()
    return db_host in {"127.0.0.1", "localhost", "::1"}


def get_database_url(force_sqlite: bool | None = None) -> str:
    """Build the active SQLAlchemy URL from the environment."""
    use_sqlite = _env_flag("USE_SQLITE") if force_sqlite is None else force_sqlite
    if use_sqlite:
        return _sqlite_url()

    explicit_url = os.getenv("DATABASE_URL", "").strip()
    if explicit_url:
        return explicit_url

    db_user = os.getenv("DB_USER", "qrie_app")
    db_password = os.getenv("DB_PASSWORD", "")
    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DB_NAME", "qrie_platform")
    db_ssl_mode = os.getenv("DB_SSL_MODE", "require").strip()

    query: dict[str, str] = {}
    if db_ssl_mode:
        query["sslmode"] = db_ssl_mode

    url = URL.create(
        "postgresql+psycopg2",
        username=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
        database=db_name,
        query=query,
    )
    return url.render_as_string(hide_password=False)


def create_db_engine(force_sqlite: bool | None = None):
    """Create the shared SQLAlchemy engine with safe pool defaults."""
    echo = os.getenv("DB_ECHO", "false").lower() == "true"
    db_url = get_database_url(force_sqlite=force_sqlite)

    if db_url.startswith("sqlite:"):
        return create_engine(
            db_url,
            echo=echo,
            future=True,
            connect_args={"check_same_thread": False},
        )

    return create_engine(
        db_url,
        echo=echo,
        future=True,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    )


def _acquire_seed_lock() -> int | None:
    timeout_seconds = int(os.getenv("DB_SEED_LOCK_TIMEOUT_SECONDS", "30"))
    deadline = time.monotonic() + timeout_seconds
    _SEED_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)

    while time.monotonic() < deadline:
        try:
            return os.open(str(_SEED_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_RDWR)
        except FileExistsError:
            time.sleep(0.25)

    return None


def _release_seed_lock(handle: int | None) -> None:
    if handle is None:
        return

    try:
        os.close(handle)
    finally:
        try:
            _SEED_LOCK_PATH.unlink()
        except FileNotFoundError:
            pass


def _seed_status(session) -> dict[str, bool]:
    metadata_names = {
        row[0]
        for row in session.query(DatasetMetadata.dataset_name)
        .filter(
            DatasetMetadata.dataset_name.in_(
                (
                    "enriched_cbom_summary",
                    "subdomains_seed_status",
                    "findings_seed_status",
                    "simulation_seed_status",
                )
            )
        )
        .all()
    }
    return {
        "cbom": session.query(Asset.id).first() is None or "enriched_cbom_summary" not in metadata_names,
        "subdomains": session.query(Subdomain.id).first() is None or "subdomains_seed_status" not in metadata_names,
        "findings": "findings_seed_status" not in metadata_names,
        "simulation": session.query(SimulationScenario.id).first() is None or "simulation_seed_status" not in metadata_names,
    }


def seed_database_if_empty(engine) -> None:
    """Load the bundled demo datasets when the configured database is empty."""
    session_factory = get_session_factory(engine)

    session = session_factory()
    try:
        if not any(_seed_status(session).values()):
            return
    finally:
        session.close()

    lock_handle = _acquire_seed_lock()
    try:
        session = session_factory()
        try:
            status = _seed_status(session)
            if not any(status.values()):
                return

            from load_data import (
                _resolve_shadow_path,
                load_cbom_data,
                load_findings_data,
                load_simulation_data,
                load_subdomains_data,
            )

            base_path = _REPO_ROOT / "public" / "data" / "PNB"
            cbom_path = base_path / "enriched_cbom.json"
            subdomains_path = base_path / "subdomains.json"
            findings_path = _resolve_shadow_path(base_path)
            simulation_path = _REPO_ROOT / "public" / "data" / "simulation.json"

            if status["cbom"] and cbom_path.exists():
                load_cbom_data(session, cbom_path)
            if status["subdomains"] and subdomains_path.exists():
                load_subdomains_data(session, subdomains_path)
            if status["findings"] and findings_path.exists():
                load_findings_data(session, findings_path)
            if status["simulation"] and simulation_path.exists():
                load_simulation_data(session, simulation_path)
        finally:
            session.close()
    finally:
        _release_seed_lock(lock_handle)


def init_db():
    """Initialize database tables and return the engine."""
    global _SQLITE_FALLBACK_NOTIFIED

    try:
        engine = create_db_engine()
        Base.metadata.create_all(engine)
    except OperationalError as exc:
        if _env_flag("USE_SQLITE") or not _should_allow_sqlite_fallback():
            raise

        engine = create_db_engine(force_sqlite=True)
        Base.metadata.create_all(engine)

        if not _SQLITE_FALLBACK_NOTIFIED:
            hint = ""
            if "password authentication failed" in str(exc).lower():
                hint = (
                    "\nHint: the configured PostgreSQL credentials do not match the running "
                    "database. If you are using the local demo Docker database, recreate it "
                    "with `docker compose down -v` from the repo root and start again."
                )
            print(
                "Warning: PostgreSQL initialization failed; "
                f"using local SQLite fallback at {_sqlite_path()}.\n"
                f"Original error: {exc}{hint}"
            )
            _SQLITE_FALLBACK_NOTIFIED = True

    seed_database_if_empty(engine)
    return engine


def get_session_factory(engine=None):
    if engine is None:
        engine = create_db_engine()
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_session(engine=None):
    session_factory = get_session_factory(engine)
    return session_factory()
