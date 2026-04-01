"""
QRIE database-backed API server.

All read APIs source their data from PostgreSQL. Compatibility dataset endpoints
mirror the old JSON payloads so the existing frontend can keep its current
rendering logic while moving off static files.
"""

from __future__ import annotations

import os
import json
from urllib import error as urllib_error
from urllib import request as urllib_request
from datetime import datetime, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field

from src.dataset_service import (
    get_cbom_dataset,
    get_enriched_cbom_dataset,
    get_shadow_crypto_dataset,
    get_simulation_dataset,
    get_subdomains_dataset,
)
from src.models import Asset, SecurityFinding, get_session_factory, init_db

load_dotenv(override=True)

_CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:4173,http://localhost:3000",
    ).split(",")
    if origin.strip()
]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        return response


app = FastAPI(
    title="QRIE Platform - Database API",
    description="PostgreSQL-backed API for the QRIE security platform",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)
app.add_middleware(SecurityHeadersMiddleware)

db_engine = init_db()
SessionLocal = get_session_factory(db_engine)
NVIDIA_API_URL = os.getenv("NVIDIA_API_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
NVIDIA_CHAT_MODEL = os.getenv("NVIDIA_CHAT_MODEL", "nvidia/llama-3.1-nemotron-nano-8b-v1")


class ChatbotMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatbotRequest(BaseModel):
    messages: list[ChatbotMessage] = Field(min_length=1, max_length=12)
    route: str | None = Field(default=None, max_length=120)
    page_title: str | None = Field(default=None, max_length=120)
    user_name: str | None = Field(default=None, max_length=120)
    user_role: str | None = Field(default=None, max_length=120)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_chatbot_snapshot(db: Session) -> dict:
    dataset = get_enriched_cbom_dataset(db, limit=250)
    records = dataset.get("records", [])
    summary = dataset.get("_PQC_Enrichment_Summary", {})
    findings = get_shadow_crypto_dataset(db, limit=500)
    asset_types = summary.get("asset_type_distribution", {})
    cert_expiry = summary.get("cert_expiry", {})

    return {
        "total_assets": dataset.get("count_records", len(records)),
        "web_apps": asset_types.get("web_application", 0) + asset_types.get("web_server", 0),
        "apis": asset_types.get("api", 0),
        "servers": asset_types.get("database", 0) + asset_types.get("mail_server", 0) + asset_types.get("dns_server", 0),
        "expiring_certs": cert_expiry.get("within_30d", 0) + cert_expiry.get("expired", 0),
        "pqc_ready": sum(1 for record in records if (record.get("NIST PQC Readiness Label") or "").lower().startswith("pqc")),
        "pqc_not_ready": sum(1 for record in records if not (record.get("NIST PQC Readiness Label") or "").lower().startswith("pqc")),
        "finding_severity": findings.get("severity_summary", {}),
    }


def _build_chatbot_prompt(payload: ChatbotRequest, snapshot: dict) -> str:
    route = payload.page_title or payload.route or "dashboard"
    severity_summary = ", ".join(
        f"{severity}: {count}" for severity, count in (snapshot.get("finding_severity") or {}).items()
    ) or "no severity summary available"

    return (
        "You are QRIE Copilot, an in-app assistant for the Quantum Risk Intelligence Engine. "
        "Help users navigate the product, understand cybersecurity metrics, explain scanner/reporting outputs, "
        "and summarize risk in plain language. Keep answers concise, practical, and grounded in the app context below. "
        "If the user asks for data that is not present, say what is available instead of inventing values.\n\n"
        f"Current user: {payload.user_name or 'Operator'} ({payload.user_role or 'Unknown role'})\n"
        f"Current page: {route}\n"
        f"Live QRIE snapshot: total assets {snapshot['total_assets']}, web apps {snapshot['web_apps']}, "
        f"APIs {snapshot['apis']}, servers {snapshot['servers']}, expiring certificates {snapshot['expiring_certs']}, "
        f"PQC ready {snapshot['pqc_ready']}, PQC not ready {snapshot['pqc_not_ready']}, findings by severity: {severity_summary}.\n\n"
        "Key modules in QRIE: Home dashboard, Asset Inventory, Asset Discovery, CBOM, Posture of PQC, Cyber Rating, "
        "Reporting, Business Impact, and Scanner Engine."
    )


def _extract_chatbot_text(response_payload: dict) -> str:
    choices = response_payload.get("choices") or []
    if not choices:
        return ""

    content = (choices[0].get("message") or {}).get("content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(part.strip() for part in parts if part.strip()).strip()

    return ""


def _format_finding_severity(snapshot: dict) -> str:
    severity_counts = snapshot.get("finding_severity") or {}
    ordered_levels = ("critical", "high", "medium", "low", "info")
    ordered_parts = [
        f"{level.title()} {severity_counts[level]}"
        for level in ordered_levels
        if severity_counts.get(level)
    ]

    if ordered_parts:
        return ", ".join(ordered_parts)

    if severity_counts:
        return ", ".join(
            f"{severity.title()} {count}" for severity, count in severity_counts.items() if count
        ) or "No finding severity counts are available"

    return "No finding severity counts are available"


def _build_local_chatbot_response(payload: ChatbotRequest, snapshot: dict) -> str:
    latest_message = payload.messages[-1].content.strip() if payload.messages else ""
    latest_message_lower = latest_message.lower()
    route = payload.page_title or payload.route or "QRIE Workspace"
    severity_summary = _format_finding_severity(snapshot)

    snapshot_summary = (
        f"Current QRIE snapshot: {snapshot['total_assets']} assets, {snapshot['web_apps']} web apps, "
        f"{snapshot['apis']} APIs, {snapshot['servers']} servers, {snapshot['expiring_certs']} certificates "
        f"expiring within 30 days or already expired, {snapshot['pqc_ready']} PQC-ready assets, "
        f"and {snapshot['pqc_not_ready']} assets still not PQC-ready. Findings: {severity_summary}."
    )

    if any(word in latest_message_lower for word in ("hello", "hi", "hey", "help")):
        guidance = (
            f"I can still help on {route} with local QRIE guidance, risk summaries, scanner explanations, "
            "reporting suggestions, and PQC posture interpretation."
        )
    elif any(word in latest_message_lower for word in ("risk", "summary", "overview", "status")):
        guidance = (
            "The quickest place to focus is the combination of expiring certificates, non-PQC-ready assets, "
            "and any Critical or High findings in the severity mix."
        )
    elif any(word in latest_message_lower for word in ("pqc", "quantum", "posture")):
        guidance = (
            "For PQC posture, compare PQC-ready versus not-ready assets first, then review certificate and "
            "algorithm details in CBOM to prioritize remediation."
        )
    elif any(word in latest_message_lower for word in ("scanner", "scan", "discovery", "asset")):
        guidance = (
            "For scanner work, use Asset Discovery to identify targets, then review CBOM and Scanner Engine "
            "outputs together to confirm TLS versions, cipher suites, certificates, and exposed services."
        )
    elif any(word in latest_message_lower for word in ("report", "reporting", "business impact", "q-var")):
        guidance = (
            "For reporting, turn the current exposure into a short narrative: what is exposed now, which assets "
            "drive the highest risk, and which remediation actions reduce business impact fastest."
        )
    else:
        guidance = (
            f"I can answer from the live QRIE dataset for {route}, but full free-form AI responses stay disabled "
            "until `NVIDIA_API_KEY` is configured."
        )

    return (
        "QRIE Copilot is running in local guidance mode because `NVIDIA_API_KEY` is not configured.\n\n"
        f"{snapshot_summary}\n\n"
        f"{guidance}"
    )


def _serialize_asset_detail(asset: Asset) -> dict:
    payload = dict(asset.record_data or {})
    if payload:
        return payload
    return {
        "Asset ID": asset.id,
        "Asset": asset.fqdn,
        "IP Address": asset.ip_address,
        "Port": asset.port,
        "TLS Version": asset.active_tls_version,
        "Cipher Suite": asset.cipher_suite,
        "Key Exchange Algorithm": asset.key_exchange,
        "Encryption Algorithm": asset.encryption,
        "Hash Algorithm": asset.hash_algorithm,
        "Key Size (Bits)": asset.key_size,
        "PFS Status": "Yes" if asset.pfs_enabled else "No",
        "Issuer CA": asset.issuer_ca,
        "Subject CN": asset.subject_cn,
        "Asset Type": asset.asset_type,
        "HEI_Score": asset.hei_score,
        "Risk_Category": asset.risk_category,
        "NIST PQC Readiness Label": asset.pqc_readiness,
    }


@app.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    asset_count = db.query(Asset).count()
    return {
        "status": "healthy",
        "service": "QRIE Database API",
        "version": "3.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "assets": asset_count,
    }


@app.get("/api/datasets/enriched-cbom")
async def dataset_enriched_cbom(
    limit: int | None = Query(None, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return get_enriched_cbom_dataset(db, limit=limit, offset=offset)


@app.get("/api/datasets/subdomains")
async def dataset_subdomains(
    limit: int | None = Query(None, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return get_subdomains_dataset(db, limit=limit, offset=offset)


@app.get("/api/datasets/shadow-crypto")
async def dataset_shadow_crypto(
    severity: str | None = None,
    finding_type: str | None = None,
    limit: int | None = Query(None, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    return get_shadow_crypto_dataset(db, severity=severity, finding_type=finding_type, limit=limit)


@app.get("/api/datasets/simulation")
async def dataset_simulation(db: Session = Depends(get_db)):
    return get_simulation_dataset(db)


@app.get("/api/assets")
async def get_assets(
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return get_cbom_dataset(db, limit=limit, offset=offset)


@app.get("/api/assets/{asset_id}")
async def get_asset_detail(asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True, "data": _serialize_asset_detail(asset)}


@app.get("/api/assets/search/{fqdn}")
async def search_assets(fqdn: str, db: Session = Depends(get_db)):
    assets = (
        db.query(Asset)
        .filter(Asset.fqdn.ilike(f"%{fqdn}%"))
        .order_by(Asset.source_index.asc(), Asset.id.asc())
        .limit(50)
        .all()
    )
    return {
        "success": True,
        "count": len(assets),
        "data": [_serialize_asset_detail(asset) for asset in assets],
    }


@app.get("/api/cbom")
async def get_cbom(limit: int = Query(100, ge=1, le=10000), db: Session = Depends(get_db)):
    return get_cbom_dataset(db, limit=limit)


@app.get("/api/subdomains")
async def get_subdomains(
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return get_subdomains_dataset(db, limit=limit, offset=offset)


@app.get("/api/shadow-crypto")
async def get_shadow_crypto(
    severity: str | None = None,
    finding_type: str | None = None,
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    return get_shadow_crypto_dataset(db, severity=severity, finding_type=finding_type, limit=limit)


@app.get("/api/findings/by-asset/{asset_id}")
async def get_findings_by_asset(asset_id: str, db: Session = Depends(get_db)):
    findings = (
        db.query(SecurityFinding)
        .filter(SecurityFinding.asset_id == asset_id)
        .order_by(SecurityFinding.source_index.asc(), SecurityFinding.id.asc())
        .all()
    )
    return {
        "success": True,
        "asset_id": asset_id,
        "count": len(findings),
        "findings": [finding.record_data or {} for finding in findings],
    }


@app.get("/api/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    dataset = get_enriched_cbom_dataset(db)
    records = dataset["records"]
    summary = dataset["_PQC_Enrichment_Summary"]
    findings = get_shadow_crypto_dataset(db)

    expiring = summary.get("cert_expiry", {}).get("within_30d", 0) + summary.get("cert_expiry", {}).get("expired", 0)
    asset_types = summary.get("asset_type_distribution", {})

    return {
        "success": True,
        "assets": {
            "total": dataset["count_records"],
            "web_apps": asset_types.get("web_application", 0) + asset_types.get("web_server", 0),
            "apis": asset_types.get("api", 0),
            "servers": asset_types.get("database", 0) + asset_types.get("mail_server", 0) + asset_types.get("dns_server", 0),
        },
        "findings": {
            "expiring_certs": expiring,
            "by_severity": findings.get("severity_summary", {}),
        },
        "pqc": {
            "ready": sum(1 for record in records if (record.get("NIST PQC Readiness Label") or "").lower().startswith("pqc")),
            "not_ready": sum(1 for record in records if not (record.get("NIST PQC Readiness Label") or "").lower().startswith("pqc")),
        },
    }


@app.get("/api/cyber-rating")
async def get_cyber_rating(db: Session = Depends(get_db)):
    dataset = get_enriched_cbom_dataset(db)
    records = dataset["records"]

    if not records:
        return {"success": True, "score": 0, "tier": "Unknown", "assets_count": 0}

    avg_hei = sum((record.get("HEI_Score") or 0) for record in records) / len(records)
    score = max(0, min(1000, round(avg_hei * 10)))
    tier = "Elite" if score >= 701 else "Standard" if score >= 400 else "Legacy" if score >= 200 else "Critical"

    return {
        "success": True,
        "score": score,
        "tier": tier,
        "avg_hei": round(avg_hei, 2),
        "assets_count": len(records),
        "records": records,
    }


@app.get("/api/business-impact")
async def get_business_impact(db: Session = Depends(get_db)):
    return get_simulation_dataset(db)


@app.get("/api/pqc-posture")
async def get_pqc_posture(db: Session = Depends(get_db)):
    dataset = get_enriched_cbom_dataset(db)
    records = dataset["records"]
    pqc_ready = [
        record
        for record in records
        if "pqc" in (record.get("NIST PQC Readiness Label") or "").lower()
    ]

    return {
        **dataset,
        "success": True,
        "pqcReady": len(pqc_ready),
        "notReady": len(records) - len(pqc_ready),
        "total": len(records),
    }


@app.post("/api/chatbot")
async def chatbot(payload: ChatbotRequest, db: Session = Depends(get_db)):
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    snapshot = _get_chatbot_snapshot(db)
    if not api_key:
        return {
            "success": True,
            "message": _build_local_chatbot_response(payload, snapshot),
            "model": "local-fallback",
            "mode": "fallback",
        }

    system_prompt = _build_chatbot_prompt(payload, snapshot)
    request_body = {
        "model": NVIDIA_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            *[message.model_dump() for message in payload.messages[-10:]],
        ],
        "temperature": 0.25,
        "top_p": 0.9,
        "max_tokens": 500,
    }

    upstream_request = urllib_request.Request(
        NVIDIA_API_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(upstream_request, timeout=45) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(
            status_code=502,
            detail=f"NVIDIA API request failed with status {exc.code}. {error_body[:300]}".strip(),
        ) from exc
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to reach NVIDIA API: {exc.reason}") from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="The NVIDIA API request timed out.") from exc

    assistant_message = _extract_chatbot_text(response_payload)
    if not assistant_message:
        raise HTTPException(status_code=502, detail="NVIDIA API returned an empty chatbot response.")

    return {
        "success": True,
        "message": assistant_message,
        "model": NVIDIA_CHAT_MODEL,
        "mode": "remote",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "database_api:app",
        host="0.0.0.0",
        port=int(os.getenv("DATABASE_API_PORT", "8001")),
        reload=False,
    )
