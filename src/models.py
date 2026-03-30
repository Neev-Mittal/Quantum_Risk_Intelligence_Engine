"""
Database Models for QRIE Platform
Uses SQLAlchemy ORM for PostgreSQL persistence
"""

from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, JSON,
    ForeignKey, Index, create_engine, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from typing import Optional

Base = declarative_base()


class Asset(Base):
    """TLS/CBOM Asset data"""
    __tablename__ = "assets"
    
    # Primary identifiers
    id = Column(String(50), primary_key=True)
    fqdn = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), index=True)  # IPv4 or IPv6
    port = Column(Integer, default=443)
    
    # TLS Configuration
    tls_supported = Column(Boolean, default=True)
    supported_tls_versions = Column(JSON)  # ["TLSv1.2", "TLSv1.3"]
    min_tls = Column(String(10))  # e.g., "TLSv1.2"
    max_tls = Column(String(10))  # e.g., "TLSv1.3"
    active_tls_version = Column(String(10))  # e.g., "TLSv1.3"
    
    # Cipher Suite & Algorithms
    cipher_suite = Column(String(100))
    key_exchange = Column(String(50))  # e.g., "ECDHE"
    encryption = Column(String(50))  # e.g., "AES_128_GCM"
    hash_algorithm = Column(String(50))  # e.g., "SHA256"
    public_key_algo = Column(String(50))  # e.g., "RSA"
    signature_algo = Column(String(100))
    
    # Key Information
    key_size = Column(Integer)  # bits
    pfs_enabled = Column(Boolean)  # Perfect Forward Secrecy
    
    # Certificate Information
    issuer_ca = Column(String(255))
    cert_not_before = Column(DateTime)
    cert_not_after = Column(DateTime)
    
    # Security Assessment
    hei_score = Column(Float, default=50.0)  # 0-100
    risk_category = Column(String(20))  # Critical, High, Medium, Low
    pqc_readiness = Column(String(100))  # NIST PQC readiness label
    
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


class Subdomain(Base):
    """DNS Subdomain Discovery data"""
    __tablename__ = "subdomains"
    
    id = Column(Integer, primary_key=True)
    fqdn = Column(String(255), nullable=False, unique=True, index=True)
    parent_domain = Column(String(255), index=True)
    
    # Resolution
    ips = Column(JSON)  # ["103.109.224.159", "103.109.225.159"]
    status = Column(String(20))  # "resolved", "unresolved"
    asset_type = Column(String(50))  # "domain", "subdomain"
    
    # Discovery metadata
    sources = Column(JSON)  # ["subfinder", "amass"]
    resolved_at = Column(DateTime)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_subdomain_fqdn', 'fqdn'),
        Index('idx_subdomain_parent', 'parent_domain'),
    )
    
    def __repr__(self):
        return f"<Subdomain {self.fqdn}>"


class SecurityFinding(Base):
    """Security findings (Shadow Crypto analysis)"""
    __tablename__ = "security_findings"
    
    id = Column(Integer, primary_key=True)
    
    # Finding metadata
    finding_type = Column(String(50), index=True)  # weak_tls, self_signed_cert, cert_mismatch
    severity = Column(String(20), index=True)  # critical, high, medium, low, info
    
    # Asset reference
    asset_id = Column(String(50), ForeignKey("assets.id"), nullable=True)
    fqdn = Column(String(255), index=True)
    ip_address = Column(String(45))
    port = Column(Integer, default=443)
    
    # Finding details
    description = Column(String(1000))
    recommendation = Column(String(1000))
    details = Column(JSON)  # Additional technical details
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    asset = relationship("Asset", back_populates="findings")
    
    __table_args__ = (
        Index('idx_finding_fqdn_type', 'fqdn', 'finding_type'),
        Index('idx_finding_severity', 'severity'),
    )
    
    def __repr__(self):
        return f"<Finding {self.finding_type}@{self.fqdn}>"


class SimulationScenario(Base):
    """Business Impact Simulation scenarios"""
    __tablename__ = "simulation_scenarios"
    
    id = Column(Integer, primary_key=True)
    
    # Scenario metadata
    scenario_name = Column(String(100))  # Aggressive, Moderate, Conservative
    scenario_type = Column(String(50))
    
    # Financial Impact
    blast_radius = Column(Integer)  # Number of affected assets
    direct_loss_min = Column(Float)  # USD
    direct_loss_max = Column(Float)  # USD
    indirect_loss_min = Column(Float)
    indirect_loss_max = Column(Float)
    
    # Risk metrics
    probability_percent = Column(Float)  # 0-100
    qvar_value = Column(Float)  # Quantile Value at Risk
    
    # Timeline
    recovery_time_hours = Column(Integer)
    downtime_cost_per_hour = Column(Float)
    
    # Assumptions
    assumptions = Column(JSON)
    affected_services = Column(JSON)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    def __repr__(self):
        return f"<SimulationScenario {self.scenario_name}>"


class ScanMetadata(Base):
    """Metadata about scan/assessment runs"""
    __tablename__ = "scan_metadata"
    
    id = Column(Integer, primary_key=True)
    
    scan_name = Column(String(100), index=True)
    scan_type = Column(String(50))  # "tls_scan", "subdomain_enumeration", etc.
    
    # Target
    target_domain = Column(String(255), index=True)
    target_scope = Column(JSON)  # Additional scope details
    
    # Timing
    started_at = Column(DateTime, index=True)
    completed_at = Column(DateTime)
    
    # Results
    total_assets_found = Column(Integer)
    total_findings = Column(Integer)
    scan_status = Column(String(20))  # completed, failed, in_progress
    
    # Configuration
    tools_used = Column(JSON)  # ["subfinder", "tlsscan"]
    config = Column(JSON)
    
    def __repr__(self):
        return f"<ScanMetadata {self.scan_name}>"


# Database connection
def get_database_url():
    """Get the database URL from environment or default"""
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "qrie_platform")
    
    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


def init_db():
    """Initialize database and create tables"""
    engine = create_engine(get_database_url(), echo=False)
    Base.metadata.create_all(engine)
    return engine


def get_session(engine=None):
    """Get a database session"""
    if engine is None:
        engine = create_engine(get_database_url())
    Session = sessionmaker(bind=engine)
    return Session()
