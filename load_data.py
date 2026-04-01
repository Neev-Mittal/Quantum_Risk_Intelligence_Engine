"""
Populate PostgreSQL from the QRIE dataset files.

The loader imports the enriched CBOM payload used by the UI, stores the
normalized fields for querying, and keeps the original rich payload encrypted
for compatibility with existing pages and reports.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(__file__))

from src.dataset_service import compute_enrichment_summary, upsert_dataset_metadata  # noqa: E402
from src.models import (  # noqa: E402
    Asset,
    Base,
    SecurityFinding,
    SimulationScenario,
    Subdomain,
    create_db_engine,
    get_session_factory,
)


def _mark_seed_status(session: Session, dataset_name: str, imported: int) -> None:
    upsert_dataset_metadata(
        session,
        dataset_name,
        {
            "seeded": True,
            "records": imported,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )


def parse_iso_datetime(value):
    """Parse ISO 8601 timestamps into datetime objects."""
    if not value:
        return None
    if not isinstance(value, str):
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _load_json(path: Path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _resolve_shadow_path(base_path: Path) -> Path:
    candidates = [
        base_path / "shadow_crypto.json",
        base_path / "shadow-crypto.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def load_cbom_data(session: Session, json_path: Path) -> int:
    """Load enriched CBOM asset records into the database."""
    print(f"Loading enriched CBOM data from {json_path}...")

    payload = _load_json(json_path)
    records = payload.get("records", [])
    print(f"Found {len(records)} enriched asset records to import")

    imported = 0

    for index, record in enumerate(records):
        asset_id = record.get("Asset ID")
        if not asset_id:
            continue

        asset = session.query(Asset).filter(Asset.id == asset_id).first()
        if asset is None:
            asset = Asset(id=asset_id)
            session.add(asset)

        cert_info = record.get("Certificate Validity (Not Before/After)", {}) or {}

        asset.fqdn = record.get("Asset")
        asset.ip_address = record.get("IP Address")
        asset.port = record.get("Port", 443)

        asset.tls_supported = record.get("TLS Supported", True)
        asset.supported_tls_versions = record.get("Supported TLS Versions", [])
        asset.min_tls = record.get("Minimum Supported TLS")
        asset.max_tls = record.get("Maximum Supported TLS")
        asset.active_tls_version = record.get("TLS Version")

        asset.cipher_suite = record.get("Cipher Suite")
        asset.key_exchange = record.get("Key Exchange Algorithm")
        asset.encryption = record.get("Encryption Algorithm")
        asset.hash_algorithm = record.get("Hash Algorithm")
        asset.public_key_algo = record.get("Public Key Algorithm")
        asset.signature_algo = record.get("Signature Algorithm")
        asset.authentication_algorithm = record.get("Authentication Algorithm")

        asset.key_size = record.get("Key Size (Bits)")
        asset.pfs_enabled = record.get("PFS Status") == "Yes"

        asset.issuer_ca = record.get("Issuer CA")
        asset.subject_cn = record.get("Subject CN")
        asset.cert_not_before = parse_iso_datetime(cert_info.get("Not Before"))
        asset.cert_not_after = parse_iso_datetime(cert_info.get("Not After"))

        asset.asset_type = record.get("Asset Type")
        asset.hei_score = record.get("HEI_Score")
        asset.mds_score = record.get("MDS_Score")
        asset.risk_category = record.get("Risk_Category")
        asset.pqc_readiness = record.get("NIST PQC Readiness Label", "")
        asset.remediation_priority = record.get("Remediation_Priority")
        asset.scoring_confidence = record.get("Scoring_Confidence")

        asset.http_scheme = record.get("HTTP Scheme")
        asset.http_url = record.get("HTTP URL")
        asset.http_status = record.get("HTTP Status")
        asset.page_title = record.get("Page Title")
        asset.web_server = record.get("Web Server")
        asset.detected_os = record.get("Detected OS")
        asset.os_confidence = record.get("OS Confidence")
        asset.body_snippet = record.get("Body Snippet")
        asset.certification_status = record.get("Certification_Status")
        asset.oid_reference = record.get("OID Reference")
        asset.error = record.get("Error")
        asset.latency_ms = record.get("Handshake Latency")
        asset.scan_status = record.get("Scan Status")
        asset.source_index = index
        asset.record_data = record

        imported += 1
        if imported % 250 == 0:
            session.flush()
            print(f"  Upserted {imported} assets...")

    summary = payload.get("_PQC_Enrichment_Summary") or compute_enrichment_summary(records)
    upsert_dataset_metadata(session, "enriched_cbom_summary", summary)
    _mark_seed_status(session, "cbom_seed_status", imported)
    session.commit()

    print(f"[ok] Enriched CBOM import complete: {imported} records upserted\n")
    return imported


def load_subdomains_data(session: Session, json_path: Path) -> int:
    """Load subdomain discovery data into the Subdomain table."""
    print(f"Loading subdomains data from {json_path}...")

    payload = _load_json(json_path)
    if isinstance(payload, list):
        subdomains = [
            {
                "fqdn": fqdn,
                "ips": [],
                "status": "active",
                "asset_type": "api" if fqdn.startswith("api.") else "domain",
                "sources": [],
                "resolved_at_utc": None,
            }
            for fqdn in payload
        ]
    else:
        subdomains = payload.get("subdomains", [])

    print(f"Found {len(subdomains)} subdomains to import")

    imported = 0

    for index, sub in enumerate(subdomains):
        fqdn = sub.get("fqdn")
        if not fqdn:
            continue

        row = session.query(Subdomain).filter(Subdomain.fqdn == fqdn).first()
        if row is None:
            row = Subdomain(fqdn=fqdn)
            session.add(row)

        parts = fqdn.split(".")
        row.parent_domain = ".".join(parts[-2:]) if len(parts) >= 2 else fqdn
        row.ips = sub.get("ips", [])
        row.status = sub.get("status")
        row.asset_type = sub.get("asset_type")
        row.sources = sub.get("sources", [])
        row.resolved_at = parse_iso_datetime(sub.get("resolved_at_utc"))
        row.source_index = index
        row.record_data = sub

        imported += 1

    _mark_seed_status(session, "subdomains_seed_status", imported)
    session.commit()
    print(f"[ok] Subdomains import complete: {imported} records upserted\n")
    return imported


def load_findings_data(session: Session, json_path: Path) -> int:
    """Replace the shadow-crypto findings dataset."""
    print(f"Loading security findings from {json_path}...")

    payload = _load_json(json_path)
    findings = payload if isinstance(payload, list) else payload.get("findings", [])
    print(f"Found {len(findings)} findings to import")

    session.query(SecurityFinding).delete()
    session.flush()

    imported = 0

    for index, finding in enumerate(findings):
        fqdn = finding.get("asset")
        ip_address = finding.get("ip_address")
        port = finding.get("port", 443)

        asset_id = None
        if fqdn:
            asset = session.query(Asset).filter(
                Asset.fqdn == fqdn,
                Asset.ip_address == ip_address,
                Asset.port == port,
            ).first()
            if asset:
                asset_id = asset.id

        session.add(
            SecurityFinding(
                finding_type=finding.get("finding_type"),
                severity=finding.get("severity"),
                asset_id=asset_id,
                fqdn=fqdn,
                ip_address=ip_address,
                port=port,
                description=finding.get("description"),
                recommendation=finding.get("recommendation"),
                details=finding.get("details", {}),
                source_index=index,
                record_data=finding,
            )
        )
        imported += 1

    _mark_seed_status(session, "findings_seed_status", imported)
    session.commit()
    print(f"[ok] Findings import complete: {imported} records loaded\n")
    return imported


def load_simulation_data(session: Session, json_path: Path) -> int:
    """Replace the business impact simulation dataset."""
    print(f"Loading simulation data from {json_path}...")

    payload = _load_json(json_path)
    scenarios = payload if isinstance(payload, list) else [payload]
    print(f"Found {len(scenarios)} simulation records to import")

    session.query(SimulationScenario).delete()
    session.flush()

    imported = 0

    for index, scenario in enumerate(scenarios):
        blast_radius = scenario.get("Blast_Radius") or {}

        session.add(
            SimulationScenario(
                scenario_name=scenario.get("scenario_name") or scenario.get("Asset"),
                scenario_type=scenario.get("scenario_type") or scenario.get("Sensitivity"),
                blast_radius=len(blast_radius.get("Direct_Impact", [])) if blast_radius else scenario.get("blast_radius", 0),
                direct_loss_min=((scenario.get("Scenarios") or {}).get("Aggressive") or {}).get("QVaR", scenario.get("direct_loss_min", 0)),
                direct_loss_max=((scenario.get("Scenarios") or {}).get("Moderate") or {}).get("QVaR", scenario.get("direct_loss_max", 0)),
                indirect_loss_min=((scenario.get("Scenarios") or {}).get("Conservative") or {}).get("QVaR", scenario.get("indirect_loss_min", 0)),
                indirect_loss_max=scenario.get("indirect_loss_max", 0),
                probability_percent=scenario.get("probability_percent", 0),
                qvar_value=((scenario.get("Scenarios") or {}).get("Moderate") or {}).get("QVaR", scenario.get("qvar_value", 0)),
                recovery_time_hours=scenario.get("recovery_time_hours", 0),
                downtime_cost_per_hour=scenario.get("downtime_cost_per_hour", 0),
                assumptions=scenario.get("assumptions", {}),
                affected_services=blast_radius.get("Direct_Impact", []) + blast_radius.get("Indirect_Impact", []) + blast_radius.get("Cascading_Impact", []),
                source_index=index,
                scenario_data=scenario,
            )
        )
        imported += 1

    _mark_seed_status(session, "simulation_seed_status", imported)
    session.commit()
    print(f"[ok] Simulation import complete: {imported} records loaded\n")
    return imported


def main():
    """Load all project datasets into the configured Postgres database."""
    print("=" * 60)
    print("QRIE Platform - Database Data Loader")
    print("=" * 60)
    print()

    engine = create_db_engine()
    Base.metadata.create_all(engine)
    session_factory = get_session_factory(engine)
    session = session_factory()

    base_path = Path(__file__).parent / "public" / "data" / "PNB"
    data_files = {
        "cbom": base_path / "enriched_cbom.json",
        "subdomains": base_path / "subdomains.json",
        "findings": _resolve_shadow_path(base_path),
        "simulation": Path(__file__).parent / "public" / "data" / "simulation.json",
    }

    for key, path in data_files.items():
        if path.exists():
            print(f"[ok] Found {key} data: {path}")
        else:
            print(f"[warn] Data file not found: {path}")

    print()
    print("Starting data import...")
    print("=" * 60)
    print()

    try:
        if data_files["cbom"].exists():
            load_cbom_data(session, data_files["cbom"])

        if data_files["subdomains"].exists():
            load_subdomains_data(session, data_files["subdomains"])

        if data_files["findings"].exists():
            load_findings_data(session, data_files["findings"])

        if data_files["simulation"].exists():
            load_simulation_data(session, data_files["simulation"])

        print("=" * 60)
        print("[ok] All data imported successfully!")
        print()
        print("Database Summary:")
        print(f"  Assets: {session.query(Asset).count()}")
        print(f"  Subdomains: {session.query(Subdomain).count()}")
        print(f"  Findings: {session.query(SecurityFinding).count()}")
        print(f"  Simulation Scenarios: {session.query(SimulationScenario).count()}")
        print()

    except Exception as exc:
        session.rollback()
        print(f"[error] Error during data import: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
