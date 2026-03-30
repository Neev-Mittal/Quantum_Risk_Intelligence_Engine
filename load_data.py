"""
Data Loader - Populates PostgreSQL database from JSON files
Run this after initializing the database with: python load_data.py
"""

import json
import os
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from pathlib import Path

# Import models
import sys
sys.path.insert(0, os.path.dirname(__file__))
from src.models import (  # noqa: E402
    Asset, Subdomain, SecurityFinding, SimulationScenario, 
    Base, get_database_url
)


def load_cbom_data(session, json_path):
    """Load CBOM (assets) data into Asset table"""
    print(f"Loading CBOM data from {json_path}...")
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    records = data.get('records', [])
    print(f"Found {len(records)} records to import")
    
    imported = 0
    skipped = 0
    
    for record in records:
        try:
            # Check if asset already exists
            existing = session.query(Asset).filter(
                Asset.id == record['Asset ID']
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            # Parse certificate dates
            cert_info = record.get('Certificate Validity (Not Before/After)', {})
            
            asset = Asset(
                id=record['Asset ID'],
                fqdn=record['Asset'],
                ip_address=record.get('IP Address'),
                port=record.get('Port', 443),
                tls_supported=record.get('TLS Supported', True),
                supported_tls_versions=record.get('Supported TLS Versions', []),
                min_tls=record.get('Minimum Supported TLS'),
                max_tls=record.get('Maximum Supported TLS'),
                active_tls_version=record.get('TLS Version'),
                cipher_suite=record.get('Cipher Suite'),
                key_exchange=record.get('Key Exchange Algorithm'),
                encryption=record.get('Encryption Algorithm'),
                hash_algorithm=record.get('Hash Algorithm'),
                public_key_algo=record.get('Public Key Algorithm'),
                signature_algo=record.get('Signature Algorithm'),
                key_size=record.get('Key Size (Bits)'),
                pfs_enabled=record.get('PFS Status') == 'Yes',
                issuer_ca=record.get('Issuer CA'),
                cert_not_before=parse_iso_datetime(cert_info.get('Not Before')),
                cert_not_after=parse_iso_datetime(cert_info.get('Not After')),
                pqc_readiness=record.get('NIST PQC Readiness Label', ''),
                latency_ms=record.get('Handshake Latency'),
            )
            
            session.add(asset)
            imported += 1
            
            # Batch commit every 500 records
            if imported % 500 == 0:
                session.commit()
                print(f"  Imported {imported} assets...")
        
        except Exception as e:
            print(f"Error importing asset {record.get('Asset ID')}: {e}")
            skipped += 1
    
    session.commit()
    print(f"✓ CBOM Import complete: {imported} imported, {skipped} skipped\n")
    return imported


def load_subdomains_data(session, json_path):
    """Load subdomain discovery data into Subdomain table"""
    print(f"Loading subdomains data from {json_path}...")
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    subdomains = data.get('subdomains', [])
    print(f"Found {len(subdomains)} subdomains to import")
    
    imported = 0
    skipped = 0
    
    for sub in subdomains:
        try:
            fqdn = sub.get('fqdn')
            
            # Check if already exists
            existing = session.query(Subdomain).filter(
                Subdomain.fqdn == fqdn
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            # Extract parent domain
            parts = fqdn.split('.')
            parent = '.'.join(parts[-2:]) if len(parts) >= 2 else fqdn
            
            subdomain = Subdomain(
                fqdn=fqdn,
                parent_domain=parent,
                ips=sub.get('ips', []),
                status=sub.get('status'),
                asset_type=sub.get('asset_type'),
                sources=sub.get('sources', []),
                resolved_at=parse_iso_datetime(sub.get('resolved_at_utc')),
            )
            
            session.add(subdomain)
            imported += 1
            
            if imported % 500 == 0:
                session.commit()
                print(f"  Imported {imported} subdomains...")
        
        except Exception as e:
            print(f"Error importing subdomain {sub.get('fqdn')}: {e}")
            skipped += 1
    
    session.commit()
    print(f"✓ Subdomains Import complete: {imported} imported, {skipped} skipped\n")
    return imported


def load_findings_data(session, json_path):
    """Load security findings (shadow crypto) into SecurityFinding table"""
    print(f"Loading security findings from {json_path}...")
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    findings = data.get('findings', [])
    print(f"Found {len(findings)} findings to import")
    
    imported = 0
    skipped = 0
    
    for finding in findings:
        try:
            # Get asset ID by matching FQDN and IP
            fqdn = finding.get('asset')
            ip = finding.get('ip_address')
            port = finding.get('port', 443)
            
            asset_id = None
            asset = session.query(Asset).filter(
                Asset.fqdn == fqdn,
                Asset.ip_address == ip,
                Asset.port == port
            ).first()
            
            if asset:
                asset_id = asset.id
            
            sec_finding = SecurityFinding(
                finding_type=finding.get('finding_type'),
                severity=finding.get('severity'),
                asset_id=asset_id,
                fqdn=fqdn,
                ip_address=ip,
                port=port,
                description=finding.get('description'),
                recommendation=finding.get('recommendation'),
                details=finding.get('details', {}),
            )
            
            session.add(sec_finding)
            imported += 1
            
            if imported % 100 == 0:
                session.commit()
                print(f"  Imported {imported} findings...")
        
        except Exception as e:
            print(f"Error importing finding: {e}")
            skipped += 1
    
    session.commit()
    print(f"✓ Findings Import complete: {imported} imported, {skipped} skipped\n")
    return imported


def load_simulation_data(session, json_path):
    """Load simulation scenarios into SimulationScenario table"""
    print(f"Loading simulation data from {json_path}...")
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    scenarios = data if isinstance(data, list) else [data]
    print(f"Found {len(scenarios)} scenarios to import")
    
    imported = 0
    
    for scenario in scenarios:
        try:
            sim = SimulationScenario(
                scenario_name=scenario.get('scenario_name'),
                scenario_type=scenario.get('scenario_type'),
                blast_radius=scenario.get('blast_radius', 0),
                direct_loss_min=scenario.get('direct_loss_min', 0),
                direct_loss_max=scenario.get('direct_loss_max', 0),
                indirect_loss_min=scenario.get('indirect_loss_min', 0),
                indirect_loss_max=scenario.get('indirect_loss_max', 0),
                probability_percent=scenario.get('probability_percent', 0),
                qvar_value=scenario.get('qvar_value', 0),
                recovery_time_hours=scenario.get('recovery_time_hours', 0),
                downtime_cost_per_hour=scenario.get('downtime_cost_per_hour', 0),
                assumptions=scenario.get('assumptions', {}),
                affected_services=scenario.get('affected_services', []),
            )
            
            session.add(sim)
            imported += 1
        
        except Exception as e:
            print(f"Error importing simulation scenario: {e}")
    
    session.commit()
    print(f"✓ Simulation Import complete: {imported} imported\n")
    return imported


def parse_iso_datetime(iso_string):
    """Parse ISO 8601 datetime string"""
    if not iso_string:
        return None
    try:
        # Handle timezone-aware ISO strings
        if isinstance(iso_string, str):
            iso_string = iso_string.replace('+00:00', '').replace('Z', '')
        return datetime.fromisoformat(iso_string)
    except Exception:
        return None


def main():
    """Load all data from JSON files to database"""
    print("=" * 60)
    print("QRIE Platform - Database Data Loader")
    print("=" * 60)
    print()
    
    # Initialize database
    print("Initializing database...")
    engine = create_engine(get_database_url(), echo=False)
    Base.metadata.create_all(engine)
    
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Paths to JSON data files
    base_path = Path(__file__).parent / "public" / "data" / "PNB"
    
    data_files = {
        'cbom': base_path / "cbom.json",
        'subdomains': base_path / "subdomains.json",
        'findings': base_path / "shadow-crypto.json",
        'simulation': Path(__file__).parent / "public" / "data" / "simulation.json",
    }
    
    # Verify files exist
    for key, path in data_files.items():
        if not path.exists():
            print(f"⚠ Warning: Data file not found: {path}")
        else:
            print(f"✓ Found {key} data: {path}")
    
    print()
    print("Starting data import...")
    print("=" * 60)
    print()
    
    try:
        # Load data in order (assets first, then references to assets)
        if data_files['cbom'].exists():
            load_cbom_data(session, data_files['cbom'])
        
        if data_files['subdomains'].exists():
            load_subdomains_data(session, data_files['subdomains'])
        
        if data_files['findings'].exists():
            load_findings_data(session, data_files['findings'])
        
        if data_files['simulation'].exists():
            load_simulation_data(session, data_files['simulation'])
        
        print("=" * 60)
        print("✓ All data imported successfully!")
        print()
        
        # Print summary
        asset_count = session.query(Asset).count()
        subdomain_count = session.query(Subdomain).count()
        finding_count = session.query(SecurityFinding).count()
        scenario_count = session.query(SimulationScenario).count()
        
        print("Database Summary:")
        print(f"  Assets: {asset_count}")
        print(f"  Subdomains: {subdomain_count}")
        print(f"  Findings: {finding_count}")
        print(f"  Simulation Scenarios: {scenario_count}")
        print()
        
    except Exception as e:
        print(f"✗ Error during data import: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        session.close()


if __name__ == '__main__':
    main()
