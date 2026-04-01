"""
Compatibility dataset builders backed by Postgres.

These helpers rebuild the legacy JSON payloads that the frontend and report
generator already understand, while sourcing the data from the database.
"""

from __future__ import annotations

from collections import Counter
from statistics import mean
from typing import Any

from sqlalchemy.orm import Session

from src.models import Asset, DatasetMetadata, SecurityFinding, SimulationScenario, Subdomain


def _with_default_asset_payload(asset: Asset) -> dict[str, Any]:
    if asset.record_data:
        return dict(asset.record_data)

    cert_info = {}
    if asset.cert_not_before or asset.cert_not_after:
        cert_info = {
            "Not Before": asset.cert_not_before.isoformat() if asset.cert_not_before else None,
            "Not After": asset.cert_not_after.isoformat() if asset.cert_not_after else None,
        }

    return {
        "Asset ID": asset.id,
        "Asset": asset.fqdn,
        "IP Address": asset.ip_address,
        "Port": asset.port,
        "Supported TLS Versions": asset.supported_tls_versions or [],
        "Minimum Supported TLS": asset.min_tls,
        "Maximum Supported TLS": asset.max_tls,
        "TLS Version": asset.active_tls_version,
        "Cipher Suite": asset.cipher_suite,
        "Key Exchange Algorithm": asset.key_exchange,
        "Encryption Algorithm": asset.encryption,
        "Hash Algorithm": asset.hash_algorithm,
        "Public Key Algorithm": asset.public_key_algo,
        "Signature Algorithm": asset.signature_algo,
        "Authentication Algorithm": asset.authentication_algorithm,
        "Key Size (Bits)": asset.key_size,
        "PFS Status": "Yes" if asset.pfs_enabled else "No",
        "Issuer CA": asset.issuer_ca,
        "Subject CN": asset.subject_cn,
        "Certificate Validity (Not Before/After)": cert_info,
        "Asset Type": asset.asset_type,
        "HEI_Score": asset.hei_score,
        "MDS_Score": asset.mds_score,
        "Risk_Category": asset.risk_category,
        "NIST PQC Readiness Label": asset.pqc_readiness,
        "Remediation_Priority": asset.remediation_priority,
        "Scoring_Confidence": asset.scoring_confidence,
        "HTTP Scheme": asset.http_scheme,
        "HTTP URL": asset.http_url,
        "HTTP Status": asset.http_status,
        "Page Title": asset.page_title,
        "Web Server": asset.web_server,
        "Detected OS": asset.detected_os,
        "OS Confidence": asset.os_confidence,
        "Body Snippet": asset.body_snippet,
        "Certification_Status": asset.certification_status,
        "OID Reference": asset.oid_reference,
        "Error": asset.error,
        "Handshake Latency": asset.latency_ms,
        "Scan Status": asset.scan_status,
    }


def _with_default_subdomain_payload(subdomain: Subdomain) -> dict[str, Any]:
    if subdomain.record_data:
        return dict(subdomain.record_data)
    return {
        "fqdn": subdomain.fqdn,
        "ips": subdomain.ips or [],
        "status": subdomain.status,
        "asset_type": subdomain.asset_type,
        "sources": subdomain.sources or [],
        "resolved_at_utc": subdomain.resolved_at.isoformat() if subdomain.resolved_at else None,
    }


def _with_default_finding_payload(finding: SecurityFinding) -> dict[str, Any]:
    if finding.record_data:
        return dict(finding.record_data)
    return {
        "finding_type": finding.finding_type,
        "severity": finding.severity,
        "asset": finding.fqdn,
        "ip_address": finding.ip_address,
        "port": finding.port,
        "description": finding.description,
        "recommendation": finding.recommendation,
        "details": finding.details or {},
    }


def _with_default_simulation_payload(scenario: SimulationScenario) -> dict[str, Any]:
    if scenario.scenario_data:
        return dict(scenario.scenario_data)
    return {
        "scenario_name": scenario.scenario_name,
        "scenario_type": scenario.scenario_type,
        "blast_radius": scenario.blast_radius,
        "direct_loss_min": scenario.direct_loss_min,
        "direct_loss_max": scenario.direct_loss_max,
        "indirect_loss_min": scenario.indirect_loss_min,
        "indirect_loss_max": scenario.indirect_loss_max,
        "probability_percent": scenario.probability_percent,
        "qvar_value": scenario.qvar_value,
        "recovery_time_hours": scenario.recovery_time_hours,
        "downtime_cost_per_hour": scenario.downtime_cost_per_hour,
        "assumptions": scenario.assumptions or {},
        "affected_services": scenario.affected_services or [],
    }


def upsert_dataset_metadata(session: Session, dataset_name: str, payload: dict[str, Any]) -> None:
    metadata = session.query(DatasetMetadata).filter(DatasetMetadata.dataset_name == dataset_name).first()
    if metadata is None:
        metadata = DatasetMetadata(dataset_name=dataset_name, payload=payload)
        session.add(metadata)
    else:
        metadata.payload = payload


def get_dataset_metadata(session: Session, dataset_name: str) -> dict[str, Any] | None:
    metadata = session.query(DatasetMetadata).filter(DatasetMetadata.dataset_name == dataset_name).first()
    return dict(metadata.payload) if metadata and metadata.payload else None


def _metric(values: list[float]) -> dict[str, float]:
    if not values:
        return {"count": 0, "avg": 0.0, "min": 0.0, "max": 0.0}
    return {
        "count": len(values),
        "avg": round(mean(values), 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


def compute_enrichment_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    hei_scores = [float(r["HEI_Score"]) for r in records if r.get("HEI_Score") is not None]
    full_scores = [
        float(r["HEI_Score"])
        for r in records
        if r.get("HEI_Score") is not None and r.get("Scoring_Confidence") == "full"
    ]
    inferred_scores = [
        float(r["HEI_Score"])
        for r in records
        if r.get("HEI_Score") is not None and r.get("Scoring_Confidence") != "full"
    ]
    mds_scores = [float(r["MDS_Score"]) for r in records if r.get("MDS_Score") is not None]

    cert_expiry = Counter({
        "expired": 0,
        "within_30d": 0,
        "within_90d": 0,
        "within_365d": 0,
        "ok": 0,
        "unknown": 0,
    })
    risk_distribution = Counter()
    cert_distribution = Counter()
    qrmm_distribution = Counter()
    asset_type_distribution = Counter()
    subnet_summary = Counter()
    os_distribution = Counter()
    cipher_strength_distribution = Counter()

    cdn_detected = 0
    waf_detected = 0
    load_balanced = 0
    shadow_annotated = 0

    priorities = []

    for record in records:
        risk_distribution[record.get("Risk_Category") or "Unknown"] += 1
        cert_distribution[record.get("Certification_Status") or "Unknown"] += 1

        qrmm_level = (record.get("QRMM_Level") or {}).get("level")
        if qrmm_level is not None:
            qrmm_distribution[f"Level_{qrmm_level}"] += 1

        asset_type_distribution[record.get("Asset Type") or "unknown"] += 1

        subnet = (record.get("Network Details") or {}).get("ip_subnet")
        if subnet:
            subnet_summary[subnet] += 1

        os_distribution[record.get("Detected OS") or "Unknown"] += 1
        cipher_strength_distribution[(record.get("SSL Details") or {}).get("cipher_strength") or "Unknown"] += 1

        infra = record.get("Infrastructure") or {}
        if infra.get("cdn_provider"):
            cdn_detected += 1
        if infra.get("waf_detected"):
            waf_detected += 1
        if infra.get("load_balanced"):
            load_balanced += 1

        shadow_findings = record.get("Shadow_Crypto_Findings") or []
        if shadow_findings:
            shadow_annotated += 1

        days_until_expiry = (record.get("SSL Details") or {}).get("days_until_expiry")
        if days_until_expiry is None:
            cert_expiry["unknown"] += 1
        elif days_until_expiry < 0:
            cert_expiry["expired"] += 1
        elif days_until_expiry <= 30:
            cert_expiry["within_30d"] += 1
        elif days_until_expiry <= 90:
            cert_expiry["within_90d"] += 1
        elif days_until_expiry <= 365:
            cert_expiry["within_365d"] += 1
        else:
            cert_expiry["ok"] += 1

        priority = record.get("Remediation_Priority")
        if priority is not None:
            qrmm = record.get("QRMM_Level") or {}
            priorities.append(
                {
                    "asset": record.get("Asset"),
                    "port": record.get("Port"),
                    "HEI": record.get("HEI_Score"),
                    "MDS": record.get("MDS_Score"),
                    "priority": priority,
                    "QRMM": qrmm.get("level"),
                    "QRMM_label": qrmm.get("label"),
                    "confidence": record.get("Scoring_Confidence"),
                }
            )

    priorities.sort(key=lambda row: (row.get("priority") or 0), reverse=True)

    return {
        "total_assets": len(records),
        "scored": len(hei_scores),
        "scored_full_data": len(full_scores),
        "scored_inferred": len(inferred_scores),
        "unscored_unreachable": 0,
        "unscored_no_data": max(len(records) - len(hei_scores), 0),
        "shadow_annotated": shadow_annotated,
        "shadow_hei_adjusted": 0,
        "scoring_confidence": {
            "full": len(full_scores),
            "inferred_tls_failure": len(inferred_scores),
        },
        "HEI": _metric(hei_scores),
        "HEI_all_scored": _metric(hei_scores),
        "HEI_full_data_only": _metric(full_scores),
        "HEI_inferred_only": _metric(inferred_scores),
        "MDS": {
            "avg": round(mean(mds_scores), 2) if mds_scores else 0.0,
            "min": round(min(mds_scores), 2) if mds_scores else 0.0,
            "max": round(max(mds_scores), 2) if mds_scores else 0.0,
        },
        "cert_expiry": dict(cert_expiry),
        "top10_by_priority": priorities[:10],
        "risk_distribution": dict(risk_distribution),
        "cert_distribution": dict(cert_distribution),
        "qrmm_distribution": dict(qrmm_distribution),
        "asset_type_distribution": dict(asset_type_distribution),
        "subnet_summary": dict(subnet_summary),
        "infrastructure_summary": {
            "cdn_detected": cdn_detected,
            "waf_detected": waf_detected,
            "load_balanced": load_balanced,
        },
        "os_distribution": dict(os_distribution),
        "cipher_strength_distribution": dict(cipher_strength_distribution),
    }


def get_enriched_cbom_dataset(session: Session, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
    query = session.query(Asset).order_by(Asset.source_index.asc(), Asset.id.asc())
    total = query.count()
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    records = [_with_default_asset_payload(asset) for asset in query.all()]
    summary = get_dataset_metadata(session, "enriched_cbom_summary")
    if summary is None:
        all_records = [
            _with_default_asset_payload(asset)
            for asset in session.query(Asset).order_by(Asset.source_index.asc(), Asset.id.asc()).all()
        ]
        summary = compute_enrichment_summary(all_records)

    return {
        "count_records": total,
        "records": records,
        "_PQC_Enrichment_Summary": summary,
    }


def get_cbom_dataset(session: Session, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
    dataset = get_enriched_cbom_dataset(session, limit=limit, offset=offset)
    return {
        "count_records": dataset["count_records"],
        "records": dataset["records"],
    }


def get_subdomains_dataset(session: Session, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
    query = session.query(Subdomain).order_by(Subdomain.source_index.asc(), Subdomain.id.asc())
    total = query.count()
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    subdomains = [_with_default_subdomain_payload(row) for row in query.all()]
    return {
        "count_assets": total,
        "subdomains": subdomains,
    }


def get_shadow_crypto_dataset(
    session: Session,
    severity: str | None = None,
    finding_type: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    query = session.query(SecurityFinding).order_by(SecurityFinding.source_index.asc(), SecurityFinding.id.asc())
    if severity:
        query = query.filter(SecurityFinding.severity == severity)
    if finding_type:
        query = query.filter(SecurityFinding.finding_type == finding_type)

    total = query.count()
    if limit is not None:
        query = query.limit(limit)

    findings = [_with_default_finding_payload(row) for row in query.all()]
    severity_summary = Counter((finding.get("severity") or "unknown") for finding in findings)
    return {
        "total_findings": total,
        "severity_summary": dict(severity_summary),
        "findings": findings,
    }


def get_simulation_dataset(session: Session) -> list[dict[str, Any]]:
    rows = session.query(SimulationScenario).order_by(SimulationScenario.source_index.asc(), SimulationScenario.id.asc()).all()
    return [_with_default_simulation_payload(row) for row in rows]
