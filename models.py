"""
Database Models for QRIE Platform
Uses SQLAlchemy ORM — supports PostgreSQL (prod) and SQLite (dev)
"""

from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, JSON,
    ForeignKey, Index, create_engine, UniqueConstraint, Enum
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
import enum

Base = declarative_base()


# ─────────────────────────────────────────────────────────────────────────────
# CORRECTED: 4 roles matching QRIE access-control specification
# Old values (ADMIN / ANALYST / VIEWER) are replaced entirely.
# auth_api.py seeds users via UserRole(value) so string values must match
# exactly what DEFAULT_USERS in auth_utils.py supplies.
# ─────────────────────────────────────────────────────────────────────────────
class UserRole(str, enum.Enum):
    """
    User role enumeration — maps to QRIE access tiers.

    Role                | Organisation            | Access tier
    --------------------|-------------------------|-----------------------------
    admin               | PNB / IIT Kanpur        | Full (all pages + admin panels)
    pnb_checker         | PNB Cybersecurity Team  | Validator (CBOM, heatmaps, certs)
    compliance_auditor  | PNB Risk / Compliance   | Audit (Q-VaR, regulatory, delta)
    it_administrator    | PNB IT Ops              | Operator (scanner, drift, discovery)
    """
    admin              = "admin"
    pnb_checker        = "pnb_checker"
    compliance_auditor = "compliance_auditor"
    it_administrator   = "it_administrator"


# ─────────────────────────────────────────────────────────────────────────────
# User
# ─────────────────────────────────────────────────────────────────────────────
class User(Base):
    """User model for authentication and authorisation"""
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    username      = Column(String(100), nullable=False, unique=True, index=True)
    email         = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)

    # 2FA
    two_fa_enabled = Column(Boolean, default=False)
    two_fa_secret  = Column(String(64), nullable=True)   # TOTP secret (base32)
    backup_codes   = Column(JSON,       nullable=True)   # one-time backup codes

    # Role — default to least-privileged role
    role = Column(
        Enum(UserRole),
        default=UserRole.it_administrator,
        nullable=False,
    )

    # Account status
    is_active   = Column(Boolean, default=True,  index=True)
    is_verified = Column(Boolean, default=False)

    # Metadata
    created_at    = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login    = Column(DateTime, nullable=True)
    last_login_ip = Column(String(45), nullable=True)

    # Relationships
    sessions   = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog",    back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_user_email',  'email'),
        Index('idx_user_active', 'is_active'),
    )

    def __repr__(self):
        return f"<User {self.username} ({self.role.value})>"


# ─────────────────────────────────────────────────────────────────────────────
# UserSession
# ─────────────────────────────────────────────────────────────────────────────
class UserSession(Base):
    """Active user sessions with JWT tokens"""
    __tablename__ = "user_sessions"

    id      = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Tokens
    access_token  = Column(String(1000), nullable=False)
    refresh_token = Column(String(1000), nullable=False)

    # Session metadata
    ip_address = Column(String(45))
    user_agent = Column(String(500))

    # Expiry
    access_token_expires_at  = Column(DateTime, nullable=False)
    refresh_token_expires_at = Column(DateTime, nullable=False)

    # Status
    is_valid   = Column(Boolean,  default=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_used_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index('idx_session_user_valid', 'user_id', 'is_valid'),
    )

    def __repr__(self):
        return f"<UserSession user_id={self.user_id}>"


# ─────────────────────────────────────────────────────────────────────────────
# AuditLog
# ─────────────────────────────────────────────────────────────────────────────
class AuditLog(Base):
    """Audit logs for security and compliance (CERT-In)"""
    __tablename__ = "audit_logs"

    id      = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Action
    action        = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50))
    resource_id   = Column(String(255))

    # Request context
    ip_address = Column(String(45))
    user_agent = Column(String(500))

    # Result
    status  = Column(String(20))  # success | failure | pending
    details = Column(JSON)

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index('idx_audit_user_action', 'user_id', 'action'),
        Index('idx_audit_action_time', 'action',  'created_at'),
    )

    def __repr__(self):
        return f"<AuditLog {self.action} by user_id={self.user_id}>"


# ─────────────────────────────────────────────────────────────────────────────
# Asset  (unchanged from original)
# ─────────────────────────────────────────────────────────────────────────────
class Asset(Base):
    """TLS / CBOM Asset data"""
    __tablename__ = "assets"

    id         = Column(String(50),  primary_key=True)
    fqdn       = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45),  index=True)
    port       = Column(Integer, default=443)

    # TLS configuration
    tls_supported        = Column(Boolean, default=True)
    supported_tls_versions = Column(JSON)
    min_tls              = Column(String(10))
    max_tls              = Column(String(10))
    active_tls_version   = Column(String(10))

    # Cipher / algorithm
    cipher_suite    = Column(String(100))
    key_exchange    = Column(String(50))
    encryption      = Column(String(50))
    hash_algorithm  = Column(String(50))
    public_key_algo = Column(String(50))
    signature_algo  = Column(String(100))

    # Key info
    key_size    = Column(Integer)
    pfs_enabled = Column(Boolean)

    # Certificate
    issuer_ca       = Column(String(255))
    cert_not_before = Column(DateTime)
    cert_not_after  = Column(DateTime)

    # Security assessment
    hei_score     = Column(Float, default=50.0)
    risk_category = Column(String(20))
    pqc_readiness = Column(String(100))

    # Metadata
    latency_ms = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    findings = relationship("SecurityFinding", back_populates="asset")

    __table_args__ = (
        UniqueConstraint('fqdn', 'ip_address', 'port', name='uq_asset'),
        Index('idx_asset_fqdn_ip', 'fqdn', 'ip_address'),
    )

    def __repr__(self):
        return f"<Asset {self.fqdn}:{self.port}>"


# ─────────────────────────────────────────────────────────────────────────────
# Subdomain  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class Subdomain(Base):
    """DNS Subdomain Discovery data"""
    __tablename__ = "subdomains"

    id            = Column(Integer,  primary_key=True)
    fqdn          = Column(String(255), nullable=False, unique=True, index=True)
    parent_domain = Column(String(255), index=True)

    ips        = Column(JSON)
    status     = Column(String(20))
    asset_type = Column(String(50))

    sources     = Column(JSON)
    resolved_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_subdomain_fqdn',   'fqdn'),
        Index('idx_subdomain_parent', 'parent_domain'),
    )

    def __repr__(self):
        return f"<Subdomain {self.fqdn}>"


# ─────────────────────────────────────────────────────────────────────────────
# SecurityFinding  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class SecurityFinding(Base):
    """Security findings (Shadow Crypto analysis)"""
    __tablename__ = "security_findings"

    id = Column(Integer, primary_key=True)

    finding_type = Column(String(50),  index=True)
    severity     = Column(String(20),  index=True)

    asset_id   = Column(String(50),  ForeignKey("assets.id"), nullable=True)
    fqdn       = Column(String(255), index=True)
    ip_address = Column(String(45))
    port       = Column(Integer, default=443)

    description    = Column(String(1000))
    recommendation = Column(String(1000))
    details        = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    asset = relationship("Asset", back_populates="findings")

    __table_args__ = (
        Index('idx_finding_fqdn_type', 'fqdn', 'finding_type'),
        Index('idx_finding_severity',  'severity'),
    )

    def __repr__(self):
        return f"<Finding {self.finding_type}@{self.fqdn}>"


# ─────────────────────────────────────────────────────────────────────────────
# SimulationScenario  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class SimulationScenario(Base):
    """Business Impact Simulation scenarios"""
    __tablename__ = "simulation_scenarios"

    id = Column(Integer, primary_key=True)

    scenario_name = Column(String(100))
    scenario_type = Column(String(50))

    blast_radius      = Column(Integer)
    direct_loss_min   = Column(Float)
    direct_loss_max   = Column(Float)
    indirect_loss_min = Column(Float)
    indirect_loss_max = Column(Float)

    probability_percent = Column(Float)
    qvar_value          = Column(Float)

    recovery_time_hours    = Column(Integer)
    downtime_cost_per_hour = Column(Float)

    assumptions       = Column(JSON)
    affected_services = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<SimulationScenario {self.scenario_name}>"


# ─────────────────────────────────────────────────────────────────────────────
# ScanMetadata  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────
class ScanMetadata(Base):
    """Metadata about scan / assessment runs"""
    __tablename__ = "scan_metadata"

    id = Column(Integer, primary_key=True)

    scan_name = Column(String(100), index=True)
    scan_type = Column(String(50))

    target_domain = Column(String(255), index=True)
    target_scope  = Column(JSON)

    started_at   = Column(DateTime, index=True)
    completed_at = Column(DateTime)

    total_assets_found = Column(Integer)
    total_findings     = Column(Integer)
    scan_status        = Column(String(20))

    tools_used = Column(JSON)
    config     = Column(JSON)

    def __repr__(self):
        return f"<ScanMetadata {self.scan_name}>"


# ─────────────────────────────────────────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_database_url() -> str:
    """
    Build the database URL from environment variables.

    For local development without PostgreSQL, set in .env:
        USE_SQLITE=true
    and a file-based SQLite DB will be used instead.

    For production set:
        DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME
    """
    import os
    from dotenv import load_dotenv
    load_dotenv()

    # ── SQLite shortcut for local dev ─────────────────────────────────────────
    if os.getenv("USE_SQLITE", "false").lower() == "true":
        db_path = os.getenv("SQLITE_PATH", "./qrie.db")
        return f"sqlite:///{db_path}"

    # ── PostgreSQL (production) ───────────────────────────────────────────────
    db_user     = os.getenv("DB_USER",     "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host     = os.getenv("DB_HOST",     "localhost")
    db_port     = os.getenv("DB_PORT",     "5432")
    db_name     = os.getenv("DB_NAME",     "qrie_platform")

    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


def init_db():
    """Initialise database and create all tables"""
    engine = create_engine(get_database_url(), echo=False)
    Base.metadata.create_all(engine)
    return engine


def get_session(engine=None):
    """Get a database session"""
    if engine is None:
        engine = create_engine(get_database_url())
    Session = sessionmaker(bind=engine)
    return Session()