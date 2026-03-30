"""
QRIE API Server — Serves scanner, risk, and simulation engine outputs
Extends scanner_api.py with endpoints for asset inventory, CBOM, PQC posture, etc.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
import os
from pathlib import Path

app = FastAPI(title="QRIE Data API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory path
DATA_DIR = Path(__file__).parent / "public" / "data"

def load_json_file(filename: str):
    """Load and return JSON file from data directory."""
    file_path = DATA_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    
    with open(file_path, 'r') as f:
        return json.load(f)

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check."""
    return { "status": "ok", "message": "QRIE API Server is running" }

@app.get("/api/assets")
async def get_assets(limit: int = 100):
    """Get asset inventory from CBOM."""
    try:
        data = load_json_file("PNB/cbom.json")
        # Limit results
        if limit and 'records' in data:
            data['records'] = data['records'][:limit]
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cbom")
async def get_cbom():
    """Get Cryptographic Bill of Materials."""
    return await get_assets()

@app.get("/api/subdomains")
async def get_subdomains(limit: int = 100):
    """Get discovered subdomains."""
    try:
        data = load_json_file("PNB/subdomains.json")
        if limit and 'subdomains' in data:
            data['subdomains'] = data['subdomains'][:limit]
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/shadow-crypto")
async def get_shadow_crypto():
    """Get shadow cryptography findings."""
    try:
        return load_json_file("PNB/shadow-crypto.json")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pqc-posture")
async def get_pqc_posture():
    """Get PQC readiness posture."""
    try:
        return load_json_file("PNB/enriched_cbom.json")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cyber-rating")
async def get_cyber_rating():
    """Get cyber risk rating."""
    try:
        return load_json_file("PNB/enriched_cbom.json")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/business-impact")
async def get_business_impact():
    """Get business impact simulation results."""
    try:
        data = load_json_file("simulation.json")
        return {"records": data if isinstance(data, list) else [data]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/statistics")
async def get_statistics():
    """Get statistics for the home page dashboard."""
    try:
        total_assets = 0
        web_apps = 0
        apis = 0
        servers = 0
        expiring_certs = 0
        
        try:
            cbom_data = load_json_file("PNB/cbom.json")
            records = cbom_data.get("records", []) if isinstance(cbom_data, dict) else cbom_data
            total_assets = len(records)
            
            from datetime import datetime, timezone
            now_utc = datetime.now(timezone.utc)
            
            for r in records:
                asset_name = r.get("Asset", "") or ""
                asset_name = asset_name.lower()
                port = r.get("Port")
                
                # Asset classification
                if "api" in asset_name:
                    apis += 1
                elif port in [80, 443, 8080, 8443]:
                    web_apps += 1
                else:
                    servers += 1
                    
                # Expiring Certs
                cert_validity = r.get("Certificate Validity (Not Before/After)", {})
                not_after_str = cert_validity.get("Not After")
                if not_after_str:
                    try:
                        if not_after_str.endswith("Z"):
                            not_after_str = not_after_str[:-1] + "+00:00"
                        not_after = datetime.fromisoformat(not_after_str)
                        if not_after.tzinfo is None:
                            not_after = not_after.replace(tzinfo=timezone.utc)
                        days_left = (not_after - now_utc).days
                        if 0 <= days_left <= 30:
                            expiring_certs += 1
                    except Exception:
                        pass
        except Exception:
            pass
            
        try:
            shadow_crypto = load_json_file("PNB/shadow-crypto.json")
        except Exception:
            shadow_crypto = {"severity_summary": {"high": 0}}
            
        high_risk = shadow_crypto.get("severity_summary", {}).get("high", 0)

        return {
            "success": True,
            "assets": {
                "total": total_assets,
                "web_apps": web_apps,
                "apis": apis,
                "servers": servers
            },
            "findings": {
                "expiring_certs": expiring_certs,
                "by_severity": {
                    "high": high_risk
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
