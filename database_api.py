"""
Database API Server for QRIE Platform
FastAPI endpoints backed by PostgreSQL database
Port: 8001
"""

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import database components
from src.models import (
    Asset, Subdomain, SecurityFinding, SimulationScenario,
    ScanMetadata, get_database_url, init_db
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Initialize FastAPI
app = FastAPI(
    title="QRIE Platform - Database API",
    description="PostgreSQL-backed API for QRIE security platform",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
try:
    db_engine = init_db()
    SessionLocal = sessionmaker(bind=db_engine)
    print("✓ Database initialized successfully")
except Exception as e:
    print(f"✗ Failed to initialize database: {e}")
    print("  Make sure PostgreSQL is running and configured in .env")


# ─────────────────────────────────────────────────────────────────────────────
# Auto-load data on startup if database is empty
# ─────────────────────────────────────────────────────────────────────────────

def load_data_on_startup():
    """Auto-load data on API startup if database is empty"""
    from pathlib import Path
    import json
    
    db = SessionLocal()
    try:
        # Check if database has data
        asset_count = db.query(func.count(Asset.id)).scalar() or 0
        
        if asset_count > 0:
            print(f"✓ Database already populated ({asset_count} assets)")
            return
        
        print("⏳ Database is empty. Auto-loading data from JSON files...")
        
        # Import functions from load_data
        from load_data import (
            load_cbom_data, load_subdomains_data, 
            load_findings_data, load_simulation_data
        )
        
        # Define data file paths
        base_path = Path(__file__).parent / "public" / "data" / "PNB"
        data_files = {
            'cbom': base_path / "cbom.json",
            'subdomains': base_path / "subdomains.json",
            'findings': base_path / "shadow-crypto.json",
            'simulation': Path(__file__).parent / "public" / "data" / "simulation.json",
        }
        
        # Load each data type
        if data_files['cbom'].exists():
            load_cbom_data(db, data_files['cbom'])
        if data_files['subdomains'].exists():
            load_subdomains_data(db, data_files['subdomains'])
        if data_files['findings'].exists():
            load_findings_data(db, data_files['findings'])
        if data_files['simulation'].exists():
            load_simulation_data(db, data_files['simulation'])
        
        print("✓ Data loaded successfully on startup!")
        
    except Exception as e:
        print(f"⚠ Warning: Failed to auto-load data: {e}")
        print("  You can manually load with: python load_data.py")
    finally:
        db.close()

# Run on startup
load_data_on_startup()


def get_db() -> Session:
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "QRIE Database API",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Asset Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/assets")
async def get_assets(
    limit: int = Query(100, le=10000),
    offset: int = Query(0, ge=0),
    risk_category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get paginated list of assets with optional filtering
    
    - **limit**: Number of records (max 10000)
    - **offset**: Number to skip
    - **risk_category**: Filter by risk (Critical/High/Medium/Low)
    """
    try:
        query = db.query(Asset)
        
        # Apply filters
        if risk_category:
            query = query.filter(Asset.risk_category == risk_category)
        
        # Get total count before pagination
        total = query.count()
        
        # Apply pagination
        assets = query.order_by(Asset.created_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "success": True,
            "data": [
                {
                    "id": a.id,
                    "fqdn": a.fqdn,
                    "ip": a.ip_address,
                    "port": a.port,
                    "tlsVersion": a.active_tls_version,
                    "cipherSuite": a.cipher_suite,
                    "keySize": a.key_size,
                    "pfs": a.pfs_enabled,
                    "heiScore": a.hei_score,
                    "riskCategory": a.risk_category,
                    "pqcReadiness": a.pqc_readiness,
                    "issuer": a.issuer_ca,
                    "createdAt": a.created_at.isoformat() if a.created_at else None,
                }
                for a in assets
            ],
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "returned": len(assets),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/assets/{asset_id}")
async def get_asset_detail(asset_id: str, db: Session = Depends(get_db)):
    """Get detailed information about a specific asset"""
    
    try:
        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        # Get related findings
        findings = db.query(SecurityFinding).filter(
            SecurityFinding.asset_id == asset_id
        ).all()
        
        return {
            "success": True,
            "data": {
                "id": asset.id,
                "fqdn": asset.fqdn,
                "ip": asset.ip_address,
                "port": asset.port,
                "tlsSupported": asset.tls_supported,
                "tlsVersions": asset.supported_tls_versions,
                "minTls": asset.min_tls,
                "maxTls": asset.max_tls,
                "activeTls": asset.active_tls_version,
                "cipherSuite": asset.cipher_suite,
                "keyExchange": asset.key_exchange,
                "encryption": asset.encryption,
                "hash": asset.hash_algorithm,
                "publicKeyAlgo": asset.public_key_algo,
                "keySize": asset.key_size,
                "pfs": asset.pfs_enabled,
                "issuer": asset.issuer_ca,
                "certNotBefore": asset.cert_not_before.isoformat() if asset.cert_not_before else None,
                "certNotAfter": asset.cert_not_after.isoformat() if asset.cert_not_after else None,
                "heiScore": asset.hei_score,
                "riskCategory": asset.risk_category,
                "pqcReadiness": asset.pqc_readiness,
                "latency": asset.latency_ms,
                "findings": [
                    {
                        "type": f.finding_type,
                        "severity": f.severity,
                        "description": f.description,
                        "recommendation": f.recommendation,
                    }
                    for f in findings
                ]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/assets/search/{fqdn}")
async def search_assets(fqdn: str, db: Session = Depends(get_db)):
    """Search assets by FQDN (partial match)"""
    
    try:
        assets = db.query(Asset).filter(
            Asset.fqdn.ilike(f"%{fqdn}%")
        ).limit(50).all()
        
        return {
            "success": True,
            "data": [
                {
                    "id": a.id,
                    "fqdn": a.fqdn,
                    "ip": a.ip_address,
                    "port": a.port,
                    "heiScore": a.hei_score,
                    "riskCategory": a.risk_category,
                }
                for a in assets
            ],
            "count": len(assets),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# CBOM Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/cbom")
async def get_cbom(
    limit: int = Query(100, le=10000),
    db: Session = Depends(get_db)
):
    """Get CBOM (Component Bill of Materials) - all assets"""
    
    try:
        total = db.query(Asset).count()
        assets = db.query(Asset).limit(limit).all()
        
        return {
            "success": True,
            "count_records": total,
            "records": [
                {
                    "Asset ID": a.id,
                    "Asset": a.fqdn,
                    "IP Address": a.ip_address,
                    "Port": a.port,
                    "TLS Version": a.active_tls_version,
                    "Cipher Suite": a.cipher_suite,
                    "Key Exchange Algorithm": a.key_exchange,
                    "Encryption Algorithm": a.encryption,
                    "Hash Algorithm": a.hash_algorithm,
                    "Key Size (Bits)": a.key_size,
                    "PFS Status": "Yes" if a.pfs_enabled else "No",
                    "Issuer CA": a.issuer_ca,
                    "HEI_Score": a.hei_score,
                    "Risk_Category": a.risk_category,
                    "NIST PQC Readiness Label": a.pqc_readiness,
                }
                for a in assets
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Subdomain Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/subdomains")
async def get_subdomains(
    limit: int = Query(100, le=10000),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get subdomains with optional filtering
    
    - **status**: Filter by status (resolved/unresolved)
    """
    
    try:
        query = db.query(Subdomain)
        
        if status:
            query = query.filter(Subdomain.status == status)
        
        total = query.count()
        subdomains = query.offset(offset).limit(limit).all()
        
        return {
            "success": True,
            "count_assets": total,
            "subdomains": [
                {
                    "fqdn": s.fqdn,
                    "ips": s.ips or [],
                    "status": s.status,
                    "asset_type": s.asset_type,
                    "sources": s.sources or [],
                    "resolved_at_utc": s.resolved_at.isoformat() if s.resolved_at else None,
                }
                for s in subdomains
            ],
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subdomains/by-domain/{domain}")
async def get_subdomains_by_domain(domain: str, db: Session = Depends(get_db)):
    """Get all subdomains for a specific parent domain"""
    
    try:
        subdomains = db.query(Subdomain).filter(
            Subdomain.parent_domain == domain
        ).all()
        
        return {
            "success": True,
            "domain": domain,
            "count": len(subdomains),
            "subdomains": [
                {
                    "fqdn": s.fqdn,
                    "ips": s.ips or [],
                    "status": s.status,
                }
                for s in subdomains
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Security Findings Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/shadow-crypto")
async def get_shadow_crypto(
    severity: Optional[str] = None,
    finding_type: Optional[str] = None,
    limit: int = Query(1000, le=10000),
    db: Session = Depends(get_db)
):
    """
    Get shadow crypto (security findings) with optional filtering
    
    - **severity**: critical/high/medium/low/info
    - **finding_type**: weak_tls/self_signed_cert/cert_mismatch
    """
    
    try:
        query = db.query(SecurityFinding)
        
        if severity:
            query = query.filter(SecurityFinding.severity == severity)
        if finding_type:
            query = query.filter(SecurityFinding.finding_type == finding_type)
        
        total = query.count()
        findings = query.limit(limit).all()
        
        # Calculate severity summary
        severity_summary = db.query(
            SecurityFinding.severity,
            func.count(SecurityFinding.id)
        ).group_by(SecurityFinding.severity).all()
        
        severity_counts = {
            severity: count for severity, count in severity_summary
        }
        
        return {
            "success": True,
            "total_findings": total,
            "severity_summary": severity_counts,
            "findings": [
                {
                    "finding_type": f.finding_type,
                    "severity": f.severity,
                    "asset": f.fqdn,
                    "ip_address": f.ip_address,
                    "port": f.port,
                    "description": f.description,
                    "recommendation": f.recommendation,
                    "details": f.details or {},
                }
                for f in findings
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/findings/by-asset/{asset_id}")
async def get_findings_by_asset(asset_id: str, db: Session = Depends(get_db)):
    """Get all findings for a specific asset"""
    
    try:
        findings = db.query(SecurityFinding).filter(
            SecurityFinding.asset_id == asset_id
        ).all()
        
        return {
            "success": True,
            "asset_id": asset_id,
            "count": len(findings),
            "findings": [
                {
                    "type": f.finding_type,
                    "severity": f.severity,
                    "description": f.description,
                    "recommendation": f.recommendation,
                }
                for f in findings
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Statistics & Analytics
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    """Get overall platform statistics"""
    
    try:
        # Asset stats
        total_assets = db.query(Asset).count()
        assets_by_risk = db.query(
            Asset.risk_category,
            func.count(Asset.id)
        ).group_by(Asset.risk_category).all()
        
        # TLS version distribution
        tls_versions = db.query(
            Asset.active_tls_version,
            func.count(Asset.id)
        ).group_by(Asset.active_tls_version).all()
        
        # Finding stats
        finding_count = db.query(SecurityFinding).count()
        findings_by_severity = db.query(
            SecurityFinding.severity,
            func.count(SecurityFinding.id)
        ).group_by(SecurityFinding.severity).all()
        
        # PQC readiness
        pqc_ready = db.query(Asset).filter(
            Asset.pqc_readiness != ''
        ).count()
        
        return {
            "success": True,
            "assets": {
                "total": total_assets,
                "by_risk": {risk: count for risk, count in assets_by_risk},
                "tls_distribution": {version: count for version, count in tls_versions},
            },
            "findings": {
                "total": finding_count,
                "by_severity": {severity: count for severity, count in findings_by_severity},
            },
            "pqc": {
                "ready": pqc_ready,
                "not_ready": total_assets - pqc_ready,
                "percentage": round((pqc_ready / total_assets * 100), 2) if total_assets > 0 else 0,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cyber-rating")
async def get_cyber_rating(db: Session = Depends(get_db)):
    """Calculate overall cyber rating from asset HEI scores"""
    
    try:
        assets = db.query(Asset).all()
        
        if not assets:
            return {
                "success": True,
                "score": 0,
                "tier": "Unknown",
                "assets_count": 0,
            }
        
        avg_score = sum(a.hei_score or 50 for a in assets) / len(assets)
        score = int(avg_score * 10)
        
        if score >= 701:
            tier = "Elite"
        elif score >= 400:
            tier = "Standard"
        elif score >= 200:
            tier = "Legacy"
        else:
            tier = "Critical"
        
        return {
            "success": True,
            "score": score,
            "tier": tier,
            "avg_hei": round(avg_score, 2),
            "assets_count": len(assets),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/business-impact")
async def get_business_impact(db: Session = Depends(get_db)):
    """Get business impact simulation scenarios"""
    
    try:
        scenarios = db.query(SimulationScenario).all()
        
        return {
            "success": True,
            "scenarios": [
                {
                    "name": s.scenario_name,
                    "type": s.scenario_type,
                    "blastRadius": s.blast_radius,
                    "directLoss": {
                        "min": s.direct_loss_min,
                        "max": s.direct_loss_max,
                    },
                    "indirectLoss": {
                        "min": s.indirect_loss_min,
                        "max": s.indirect_loss_max,
                    },
                    "probability": s.probability_percent,
                    "qvarValue": s.qvar_value,
                    "recoveryHours": s.recovery_time_hours,
                    "downtimeCostPerHour": s.downtime_cost_per_hour,
                }
                for s in scenarios
            ],
            "count": len(scenarios),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PQC Posture Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/pqc-posture")
async def get_pqc_posture(db: Session = Depends(get_db)):
    """Get Post-Quantum Cryptography readiness assessment"""
    
    try:
        all_assets = db.query(Asset).all()
        pqc_ready = [a for a in all_assets if a.pqc_readiness and a.pqc_readiness.strip()]
        
        return {
            "success": True,
            "pqcReady": len(pqc_ready),
            "notReady": len(all_assets) - len(pqc_ready),
            "total": len(all_assets),
            "readyAssets": [
                {
                    "fqdn": a.fqdn,
                    "readinessLabel": a.pqc_readiness,
                }
                for a in pqc_ready
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)
