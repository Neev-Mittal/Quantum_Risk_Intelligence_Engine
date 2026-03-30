#!/usr/bin/env python3
"""
pqc_enrichment.py — PNB-QRIE Post-Quantum Risk Intelligence Engine
===================================================================
Enriches cbom.json (and shadow-crypto.json) scan outputs with five
PQC risk-model fields plus full error classification:

    HEI_Score            float  0-100
    Risk_Category        Low | Moderate | High | Critical
    MDS_Score            float  0-100
    QRMM_Level           {level: 0-3, label, description}
    Certification_Status PQC Ready | Hybrid Secure | Not Quantum Safe
    Scoring_Confidence   full | partial_probe | partial_shadow |
                         inferred_tls_failure | inferred_unknown | none
    Error_Classification (when applicable — see below)

Error Classification — why this matters
----------------------------------------
NOT all scan errors are equal. The script classifies each error into
one of five categories and acts accordingly:

  TLS_NEGOTIATION_FAILURE
    The host EXISTS and responded but TLS negotiation failed entirely.
    This is the WORST case: the server may only support SSL 2.0, a
    proprietary protocol, or severely misconfigured TLS.
    Action: Score with maximum TLS risk (tls_score = 1.0), all
    other components set to worst case → HEI = 95-100.

  TLS_HANDSHAKE_PARTIAL
    Some TLS probes succeeded (captured in TLS Probe Details) but the
    top-level handshake reported an error.
    Action: Extract cipher/KEX from probe data and score normally.

  HOST_UNREACHABLE
    Connection refused, host unreachable, NXDOMAIN — the host is simply
    not reachable from the scanner. This is an INFRASTRUCTURE issue,
    not a cryptographic one.
    Action: Mark as Unscored_Unreachable — excluded from HEI averages.

  CERTIFICATE_ISSUE
    TLS connected but certificate validation failed (expired, self-signed,
    name mismatch). TLS itself worked, so we have negotiation data.
    Action: Score with probe or top-level data + flag cert issue.

  TIMEOUT
    The scanner timed out. The host might exist with any crypto config.
    Action: Score with maximum conservative values (worst-case assumption).

  UNKNOWN_ERROR
    Any other error without a recognisable pattern.
    Action: Score with conservative worst-case values.

Shadow-crypto integration
--------------------------
shadow-crypto.json in the same folder is loaded automatically and used for:
  1. DATA RESCUE   — error assets rescued using flagged_cbom_records
  2. ANNOTATION    — Shadow_Crypto_Findings attached to matching assets
  3. RISK TUNING   — weak_tls finding → use worst accepted TLS version
                     self_signed_cert → +25 to MDS cert complexity score

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USAGE (always from the PNB-QRIE/ root)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  python3 pqc_enrichment.py PNB/cbom.json PNB/enriched_cbom.json
  python3 pqc_enrichment.py PNB/
  python3 pqc_enrichment.py --all
  python3 pqc_enrichment.py --all /custom/root

Flags:  --debug   show JSON structure and exit
        --dry-run list files without writing
"""

import json
import re
import sys
from pathlib import Path


# ─────────────────────────────────────────────────────────────
# I/O helpers
# ─────────────────────────────────────────────────────────────
def _write_stdout(text: str) -> None:
    try:
        sys.stdout.buffer.write(text.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")
        sys.stdout.buffer.flush()
    except AttributeError:
        sys.stdout.write(text + "\n")
        sys.stdout.flush()


def _err(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


# ─────────────────────────────────────────────────────────────
# Field aliases
# ─────────────────────────────────────────────────────────────
FIELD = {
    "tls_version":        ("TLS Version", "Maximum Supported TLS", "TLS_Version",
                           "tls_version", "Max TLS Version", "maxTLSVersion"),
    "min_tls":            ("Minimum Supported TLS", "Min TLS Version",
                           "minTLSVersion", "minimum_supported_tls"),
    "cipher_suite":       ("Cipher Suite", "cipher_suite", "CipherSuite", "cipherSuite"),
    "kex_algo":           ("Key Exchange Algorithm", "Key_Exchange_Algorithm",
                           "KeyExchangeAlgorithm", "kex_algorithm", "keyExchange",
                           "key_exchange_algorithm"),
    "enc_algo":           ("Encryption Algorithm", "Encryption_Algorithm",
                           "EncryptionAlgorithm", "encryption_algorithm"),
    "pfs_status":         ("PFS Status", "PFS_Status", "pfs_status",
                           "Perfect Forward Secrecy", "pfs"),
    "nist_label":         ("NIST PQC Readiness Label", "NIST_PQC_Readiness_Label",
                           "nist_pqc_label", "PQC Label", "pqcLabel"),
    "key_size":           ("Key Size (Bits)", "Key_Size_Bits", "key_size_bits",
                           "KeySize", "key_size", "keySize"),
    "sig_algo":           ("Signature Algorithm", "Signature_Algorithm",
                           "signature_algorithm", "SignatureAlgorithm"),
    "issuer_ca":          ("Issuer CA", "Issuer_CA", "issuer_ca", "IssuerCA",
                           "issuer", "Issuer"),
    "scan_status":        ("Scan Status", "Scan_Status", "scan_status",
                           "ScanStatus", "status"),
    "error_msg":          ("Error", "error", "ErrorMessage", "error_message"),
    "tls_probe":          ("TLS Probe Details", "TLS_Probe_Details",
                           "tls_probe_details", "tls_probes", "tlsProbeDetails"),
    "asset_name":         ("Asset", "asset", "hostname", "host", "domain",
                           "Hostname", "Domain"),
    "tls_supported":      ("TLS Supported", "tls_supported", "tlsSupported"),
    "supported_versions": ("Supported TLS Versions", "supported_tls_versions",
                           "SupportedTLSVersions"),
}

_ARRAY_KEYS = (
    "assets", "results", "data", "scan_results", "hosts",
    "records", "items", "entries", "scans", "report", "cbom", "domains",
)

_ASSET_SIGNALS = {
    "Asset", "asset", "hostname", "host", "domain",
    "TLS Version", "tls_version", "Cipher Suite", "cipher_suite",
    "Key Exchange Algorithm", "PFS Status", "NIST PQC Readiness Label",
    "Scan Status", "TLS Supported", "IP Address",
}


def _get(obj: dict, field_key: str, default=None):
    for alias in FIELD.get(field_key, ()):
        if alias in obj:
            return obj[alias]
    return default


def _str(obj: dict, field_key: str) -> str:
    v = _get(obj, field_key, "")
    return str(v).strip() if v is not None else ""


# ─────────────────────────────────────────────────────────────
# Error classification
# ─────────────────────────────────────────────────────────────

# Patterns are checked against the lowercase error string in order.
# The first match wins.
_ERROR_PATTERNS = [
    # TLS negotiation completely failed — server exists, TLS broken
    ("TLS_NEGOTIATION_FAILURE", [
        "no tls version successfully negotiated",
        "sslv3_alert_handshake_failure",
        "ssl/tls alert handshake failure",
        "handshake failure",
        "no protocols available",
        "no shared cipher",
        "ssl: unsupported protocol",
        "eof occurred in violation of protocol",
        "wrong version number",
        "unknown protocol",
        "sslv3 alert unexpected message",
        "record layer failure",
        "bad handshake message",
    ]),
    # Host is completely unreachable — infrastructure issue, not crypto
    ("HOST_UNREACHABLE", [
        "connection refused",
        "no route to host",
        "network unreachable",
        "name or service not known",
        "nodename nor servname",
        "getaddrinfo failed",
        "nxdomain",
        "name resolution failed",
        "errno 111",
        "errno 113",
        "errno 101",
        "[errno 111]",
        "[errno 113]",
        "[errno 101]",
        "connection reset by peer",
        "host not found",
        "temporary failure in name resolution",
    ]),
    # Certificate problems — TLS worked, cert is bad
    ("CERTIFICATE_ISSUE", [
        "certificate has expired",
        "certificate verify failed",
        "certificate_expired",
        "certificate_unknown",
        "self.signed certificate",
        "self signed certificate",
        "cert mismatch",
        "hostname mismatch",
        "unable to get local issuer certificate",
        "certificate chain error",
    ]),
    # Timeout — could be anything
    ("TIMEOUT", [
        "timed out",
        "timeout",
        "connection timed",
        "read timeout",
        "etimedout",
        "[errno 110]",
    ]),
]

# Scoring applied per error class when no TLS data is available
_ERROR_SCORE_DEFAULTS = {
    # Server exists but TLS failed → worst possible TLS config assumed
    "TLS_NEGOTIATION_FAILURE": {
        "tls_score":    1.0,   # TLS 1.0 or worse
        "kex_score":    1.0,   # classical KEX assumed
        "cipher_score": 1.0,   # weak cipher assumed
        "pfs_present":  False,
        "pfs_penalty":  15,
        "pqc_penalty":  20,
    },
    # Host unreachable → not a crypto risk; mark as unscored
    "HOST_UNREACHABLE": None,
    # Certificate issue — TLS works; use probe data if available, else moderate defaults
    "CERTIFICATE_ISSUE": {
        "tls_score":    0.5,
        "kex_score":    1.0,
        "cipher_score": 0.5,
        "pfs_present":  True,
        "pfs_penalty":  0,
        "pqc_penalty":  20,
    },
    # Timeout — unknown; conservative worst case
    "TIMEOUT": {
        "tls_score":    1.0,
        "kex_score":    1.0,
        "cipher_score": 0.75,
        "pfs_present":  False,
        "pfs_penalty":  15,
        "pqc_penalty":  20,
    },
    # Unknown — conservative worst case
    "UNKNOWN_ERROR": {
        "tls_score":    1.0,
        "kex_score":    1.0,
        "cipher_score": 0.75,
        "pfs_present":  False,
        "pfs_penalty":  15,
        "pqc_penalty":  20,
    },
}


def classify_error(error_msg: str) -> str:
    """
    Return one of:
      TLS_NEGOTIATION_FAILURE | HOST_UNREACHABLE | CERTIFICATE_ISSUE |
      TIMEOUT | TLS_HANDSHAKE_PARTIAL | UNKNOWN_ERROR
    """
    if not error_msg:
        return "UNKNOWN_ERROR"
    low = error_msg.lower()
    for class_name, patterns in _ERROR_PATTERNS:
        if any(p in low for p in patterns):
            return class_name
    return "UNKNOWN_ERROR"


# ─────────────────────────────────────────────────────────────
# TLS version parsing
# ─────────────────────────────────────────────────────────────
def _parse_tls(raw: str) -> float:
    """'TLSv1.2' -> 1.2, 'SSLv3' -> 0.3, '' -> -1."""
    if not raw:
        return -1.0
    up = raw.upper()
    if "SSL" in up:
        m = re.search(r"(\d+(?:\.\d+)?)", up)
        return float(m.group(1)) * 0.1 if m else 0.0
    m = re.search(r"(\d+\.\d+)", up)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+)", up)
    if m:
        return float(m.group(1))
    return -1.0


def _supported_probe_versions(probes) -> list:
    """Return [(version_float, probe_dict)] for all supported probes, sorted ascending."""
    if not isinstance(probes, list):
        return []
    result = []
    for p in probes:
        if not isinstance(p, dict):
            continue
        if str(p.get("supported", False)).lower() in ("true", "1", "yes"):
            v = _parse_tls(str(p.get("tls_version") or ""))
            if v > 0:
                result.append((v, p))
    return sorted(result, key=lambda x: x[0])


def _effective_tls(asset: dict) -> float:
    """Highest TLS version available — used for QRMM maturity level."""
    for fk in ("tls_version", "min_tls"):
        ver = _parse_tls(_str(asset, fk))
        if ver > 0:
            return ver
    sv = _get(asset, "supported_versions")
    if isinstance(sv, list):
        versions = [_parse_tls(str(x)) for x in sv if _parse_tls(str(x)) > 0]
        if versions:
            return max(versions)
    supported = _supported_probe_versions(_get(asset, "tls_probe"))
    if supported:
        return supported[-1][0]
    return -1.0


def _worst_tls(asset: dict, shadow_findings: list = None) -> float:
    """
    Lowest TLS version the server ACCEPTS — used for HEI risk scoring.

    Shadow weak_tls findings are checked FIRST and can override cbom data.
    Rationale: the shadow scanner independently confirmed the server accepts
    an old TLS version. If the cbom only recorded the negotiated (best)
    version, the shadow finding gives a more complete picture of exposure.
    """
    # Shadow weak_tls: always takes priority — independently confirmed old TLS
    shadow_worst = None
    if shadow_findings:
        for finding in shadow_findings:
            if finding.get("finding_type") == "weak_tls":
                weak = finding.get("details", {}).get("weak_versions", [])
                parsed = [_parse_tls(v) for v in weak if _parse_tls(v) > 0]
                if parsed:
                    shadow_worst = min(parsed)
                    break

    # cbom / probe minimum version
    cbom_worst = None
    min_ver = _parse_tls(_str(asset, "min_tls"))
    if min_ver > 0:
        cbom_worst = min_ver
    else:
        sv = _get(asset, "supported_versions")
        if isinstance(sv, list):
            versions = [_parse_tls(str(x)) for x in sv if _parse_tls(str(x)) > 0]
            if versions:
                cbom_worst = min(versions)
        if cbom_worst is None:
            supported = _supported_probe_versions(_get(asset, "tls_probe"))
            if supported:
                cbom_worst = supported[0][0]

    # Return the lowest (worst) from any source
    candidates = [v for v in (shadow_worst, cbom_worst) if v is not None]
    if candidates:
        return min(candidates)
    return _effective_tls(asset)


def _extract_from_best_probe(asset: dict) -> dict:
    """Recover cipher/KEX/PFS from the highest-version successful TLS probe."""
    supported = _supported_probe_versions(_get(asset, "tls_probe"))
    if not supported:
        return {}
    _, best_probe = supported[-1]
    recovered = {}
    for src_key, dst_key in [
        ("cipher_suite",             "Cipher Suite"),
        ("key_exchange_algorithm",   "Key Exchange Algorithm"),
        ("encryption_algorithm",     "Encryption Algorithm"),
        ("pfs_status",               "PFS Status"),
        ("authentication_algorithm", "Authentication Algorithm"),
    ]:
        val = best_probe.get(src_key)
        if val and str(val).strip().lower() not in ("", "null", "none", "unknown"):
            recovered[dst_key] = val
    return recovered


def _has_any_tls_data(asset: dict) -> bool:
    """True if the asset has ANY TLS data we can score from."""
    return (
        _effective_tls(asset) > 0
        or bool(_str(asset, "cipher_suite"))
        or bool(_str(asset, "kex_algo"))
        or bool(_supported_probe_versions(_get(asset, "tls_probe")))
    )


# ─────────────────────────────────────────────────────────────
# PQC / hybrid detection
# ─────────────────────────────────────────────────────────────
_PQC_KEM_SIGNALS = {
    "KYBER", "ML-KEM", "MLKEM", "CRYSTALS", "FRODO", "NTRU",
    "SABER", "HQC", "BIKE", "MCELIECE", "CLASSIC-MCELIECE", "XWING",
}
_HYBRID_SIGNALS = {
    "HYBRID", "X25519KYBER", "P256KYBER", "P384KYBER",
    "X25519MLKEM", "P256MLKEM", "P384MLKEM",
}


def _detect_pqc(asset: dict) -> tuple:
    combined = " ".join(filter(None, [
        _str(asset, "kex_algo"), _str(asset, "nist_label"),
        _str(asset, "cipher_suite"), _str(asset, "enc_algo"),
    ])).upper()
    uses_pqc    = any(k in combined for k in _PQC_KEM_SIGNALS)
    uses_hybrid = any(k in combined for k in _HYBRID_SIGNALS)
    if uses_pqc and not uses_hybrid:
        uses_hybrid = False
    return uses_pqc, uses_hybrid


# ─────────────────────────────────────────────────────────────
# STEP 1 — Harvest Exposure Index (HEI)
# ─────────────────────────────────────────────────────────────
def compute_hei(asset: dict,
                shadow_findings: list = None,
                error_defaults: dict = None) -> tuple:
    """
    error_defaults: pre-computed sub-scores from error classification.
    When provided, those values are used instead of field-parsed values
    for any component that cannot be read from the asset.
    """
    tls_for_risk = _worst_tls(asset, shadow_findings)
    tls_for_qrmm = _effective_tls(asset)
    ed = error_defaults or {}

    # TLS sub-score (weight 20) — worst accepted version
    if ed.get("tls_score") is not None and tls_for_risk < 0:
        tls_score = ed["tls_score"]
    elif tls_for_risk < 0:
        tls_score = 1.0
    elif tls_for_risk <= 1.1:
        tls_score = 1.0
    elif tls_for_risk < 1.3:
        tls_score = 0.5
    else:
        tls_score = 0.0

    # KEX sub-score (weight 25)
    uses_pqc, uses_hybrid = _detect_pqc(asset)
    if uses_pqc:
        kex_score = 0.0
    elif uses_hybrid:
        kex_score = 0.5
    else:
        kex_score = ed.get("kex_score", 1.0)

    # Cipher sub-score (weight 20)
    combined_c = (_str(asset, "enc_algo") + " " + _str(asset, "cipher_suite")).upper()
    if "256" in combined_c or "CHACHA20" in combined_c:
        cipher_score = 0.5
    elif "128" in combined_c or "3DES" in combined_c or "RC4" in combined_c:
        cipher_score = 1.0
    elif combined_c.strip():
        cipher_score = 0.75
    else:
        cipher_score = ed.get("cipher_score", 0.75)

    # PFS penalty (fixed +15 if absent)
    pfs_raw = _str(asset, "pfs_status").upper()
    pfs_present = pfs_raw in ("YES", "TRUE", "ENABLED", "1", "PRESENT")
    kex_raw = _str(asset, "kex_algo").upper()
    if "ECDHE" in kex_raw or "DHE" in kex_raw:
        pfs_present = True
    if not pfs_present and not pfs_raw and not kex_raw:
        pfs_present = ed.get("pfs_present", False)
    pfs_penalty = 0 if pfs_present else ed.get("pfs_penalty", 15)

    # PQC absence penalty
    pqc_any = uses_pqc or uses_hybrid or bool(_str(asset, "nist_label"))
    pqc_penalty = 0 if pqc_any else ed.get("pqc_penalty", 20)

    # Shadow finding direct HEI penalties (always applied if findings present)
    shadow_hei_bonus = 0
    shadow_flags = []
    if shadow_findings:
        for f in shadow_findings:
            ft = f.get("finding_type", "")
            if ft == "self_signed_cert" and "self_signed" not in shadow_flags:
                shadow_hei_bonus += 10   # no trusted CA = MITM risk
                shadow_flags.append("self_signed")
            elif ft == "cert_mismatch" and "cert_mismatch" not in shadow_flags:
                shadow_hei_bonus += 5    # shadow infra indicator
                shadow_flags.append("cert_mismatch")

    # Certificate expiry penalty (from cbom Certificate Validity field)
    cert_expiry_penalty = 0
    validity = asset.get("Certificate Validity (Not Before/After)") or {}
    not_after_str = str(validity.get("Not After") or validity.get("not_after") or "")
    if not_after_str:
        try:
            import datetime
            clean = re.sub(r"[+-]\d{2}:\d{2}$", "", not_after_str.replace("Z", ""))
            not_after = datetime.datetime.fromisoformat(clean)
            days_left = (not_after - datetime.datetime.now()).days
            if days_left < 0:
                cert_expiry_penalty = 10   # already expired
            elif days_left < 30:
                cert_expiry_penalty = 7    # expires within a month
            elif days_left < 90:
                cert_expiry_penalty = 3    # expires within a quarter
        except (ValueError, TypeError):
            pass

    # OID reference hint: if OID maps to a known weak algorithm, penalise
    # Common weak OIDs: 1.2.840.113549.1.1.5 = sha1WithRSAEncryption
    #                   1.2.840.113549.1.1.11 = sha256WithRSAEncryption (ok)
    oid_penalty = 0
    oid = _str(asset, "oid_ref") or str(asset.get("OID Reference") or "")
    _WEAK_OIDS = {
        "1.2.840.113549.1.1.5",   # sha1WithRSAEncryption
        "1.2.840.113549.1.1.4",   # md5WithRSAEncryption
        "1.2.840.10040.4.3",      # dsa-with-sha1
    }
    if any(w in oid for w in _WEAK_OIDS):
        oid_penalty = 5

    hei = min(round(
        20 * tls_score + 25 * kex_score + 20 * cipher_score +
        pfs_penalty + pqc_penalty +
        shadow_hei_bonus + cert_expiry_penalty + oid_penalty,
        2), 100.0)

    return hei, {
        "tls_version_for_risk":  tls_for_risk,
        "tls_version_for_qrmm":  tls_for_qrmm,
        "tls_score":             tls_score,
        "kex_score":             kex_score,
        "uses_pqc_kem":          uses_pqc,
        "uses_hybrid":           uses_hybrid,
        "cipher_score":          cipher_score,
        "pfs_present":           pfs_present,
        "pfs_penalty":           pfs_penalty,
        "pqc_any":               pqc_any,
        "pqc_penalty":           pqc_penalty,
        "shadow_hei_bonus":      shadow_hei_bonus,
        "shadow_flags":          shadow_flags,
        "cert_expiry_penalty":   cert_expiry_penalty,
        "oid_penalty":           oid_penalty,
        "used_error_defaults":   bool(ed),
    }


# ─────────────────────────────────────────────────────────────
# STEP 2 — Risk Category
# ─────────────────────────────────────────────────────────────
def risk_category(hei: float) -> str:
    if hei <= 25: return "Low"
    if hei <= 50: return "Moderate"
    if hei <= 75: return "High"
    return "Critical"


# ─────────────────────────────────────────────────────────────
# STEP 3 — Migration Difficulty Score (MDS)
# ─────────────────────────────────────────────────────────────
_LARGE_CA_ORGS = {
    "DIGICERT", "LETS ENCRYPT", "AMAZON", "MICROSOFT", "GOOGLE",
    "CLOUDFLARE", "COMODO", "SECTIGO", "ENTRUST", "GLOBALSIGN",
    "QUOVADIS", "GODADDY", "IDENTRUST", "VERISIGN", "THAWTE",
    "GEOTRUST", "ACTALIS", "BUYPASS", "TRUSTWAVE",
}


def compute_mds(asset: dict, tls_ver: float,
                shadow_findings: list = None,
                error_class: str = None) -> tuple:
    # Factor 1 – Legacy TLS (0.30)
    if tls_ver < 0:
        # Use worst assumption only if we know TLS exists
        legacy = 100 if error_class == "TLS_NEGOTIATION_FAILURE" else 75
    elif tls_ver <= 1.1: legacy = 90
    elif tls_ver < 1.3:  legacy = 50
    else:                legacy = 10

    # Factor 2 – Hardware (0.20)
    key_size = 0
    raw_ks = _get(asset, "key_size")
    try:
        key_size = int(str(raw_ks).replace(",", "").strip()) if raw_ks else 0
    except (ValueError, TypeError):
        key_size = 0
    nist = _str(asset, "nist_label")
    if nist:               hardware = 25
    elif key_size >= 4096: hardware = 40
    elif key_size >= 2048: hardware = 55
    elif key_size > 0:     hardware = 75
    else:                  hardware = 65

    # Factor 3 – Certificate Ecosystem (0.30)
    sig    = _str(asset, "sig_algo").upper()
    issuer = _str(asset, "issuer_ca")
    cert   = 50
    if "SHA1" in sig or "MD5" in sig:
        cert += 20
    elif "SHA384" in sig or "SHA512" in sig or "ECDSA" in sig:
        cert -= 10
    if issuer.upper().count("CN=") + issuer.upper().count("O=") > 4:
        cert += 15
    if shadow_findings:
        for f in shadow_findings:
            if f.get("finding_type") == "self_signed_cert":
                cert += 25   # no CA chain = much harder migration
                break
    if shadow_findings:
        for f in shadow_findings:
            if f.get("finding_type") == "cert_mismatch":
                cert += 15   # shadow infrastructure = complex cert landscape
                break
    if error_class == "CERTIFICATE_ISSUE":
        cert = min(cert + 20, 100)
    cert = max(0, min(100, cert))

    # Factor 4 – Vendor Dependencies (0.20)
    issuer_up = issuer.upper()
    asset_up  = _str(asset, "asset_name").upper()
    vendor = 30 if any(org in issuer_up or org in asset_up
                       for org in _LARGE_CA_ORGS) else 65

    mds = min(round(
        0.30 * legacy + 0.20 * hardware + 0.30 * cert + 0.20 * vendor, 2),
        100.0)

    return mds, {
        "legacy_tls_score": legacy,
        "hardware_score":   hardware,
        "cert_score":       cert,
        "vendor_score":     vendor,
    }


# ─────────────────────────────────────────────────────────────
# STEP 4 — QRMM Level
# ─────────────────────────────────────────────────────────────
def compute_qrmm(tls_ver: float, pfs_present: bool,
                 uses_pqc: bool, uses_hybrid: bool) -> dict:
    if uses_pqc and tls_ver >= 1.2:
        return {"level": 3, "label": "Fully PQC Implemented",
                "description": "NIST-approved PQC KEM in use (Kyber/ML-KEM). Legacy algorithms effectively disabled."}
    if uses_hybrid and tls_ver >= 1.2:
        return {"level": 2, "label": "Hybrid Deployment",
                "description": "Classical + PQC key exchange in parallel. Quantum defence-in-depth with backward compatibility."}
    if pfs_present and tls_ver >= 1.2:
        return {"level": 1, "label": "Strong Classical + PFS",
                "description": "Best-practice classical crypto with PFS. No PQC yet; vulnerable to harvest-now attacks."}
    return {"level": 0, "label": "Classical Insecure",
            "description": "Classical crypto with known weaknesses (TLS <= 1.1 or no PFS). Highest quantum exposure."}


# ─────────────────────────────────────────────────────────────
# STEP 5 — Certification Status
# ─────────────────────────────────────────────────────────────
def compute_cert_status(hei: float, uses_pqc: bool, uses_hybrid: bool) -> str:
    if uses_pqc:
        return "PQC Ready"
    if uses_hybrid and hei <= 50:
        return "Hybrid Secure"
    return "Not Quantum Safe"


# ─────────────────────────────────────────────────────────────
# Shadow-crypto.json loader
# ─────────────────────────────────────────────────────────────
def load_shadow_crypto(folder: Path) -> tuple:
    shadow_path = folder / "shadow-crypto.json"
    if not shadow_path.exists():
        return {}, {}
    try:
        with shadow_path.open("r", encoding="utf-8-sig") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        _err(f"  WARNING: could not load {shadow_path} -- {exc}")
        return {}, {}

    findings_by_asset, records_by_asset = {}, {}
    for finding in data.get("findings", []):
        name = str(finding.get("asset") or "").strip().lower()
        if name:
            findings_by_asset.setdefault(name, []).append(finding)
    for record in data.get("flagged_cbom_records", []):
        name = str(_get(record, "asset_name") or record.get("Asset") or "").strip().lower()
        if name:
            records_by_asset[name] = record

    _err(f"  Shadow-crypto: {len(findings_by_asset)} flagged assets, "
         f"{len(records_by_asset)} CBOM records from {shadow_path.name}")
    return findings_by_asset, records_by_asset


def _asset_key(asset: dict) -> str:
    return str(_get(asset, "asset_name") or "").strip().lower()


# ─────────────────────────────────────────────────────────────
# Core: enrich one asset
# ─────────────────────────────────────────────────────────────
def enrich(asset: dict,
           shadow_findings: list = None,
           shadow_record: dict = None) -> dict:
    out = dict(asset)

    # Always attach shadow findings
    if shadow_findings:
        out["Shadow_Crypto_Findings"] = shadow_findings

    # ── Determine error state and classify it ───────────────
    scan_status = _str(asset, "scan_status").lower()
    error_msg   = _str(asset, "error_msg")
    is_scan_error = (scan_status == "error") or (
        scan_status not in ("ok", "success", "")
        and scan_status != ""
    ) or (
        scan_status == "" and bool(error_msg)
        and not _has_any_tls_data(asset)
    )

    error_class = None
    if is_scan_error or error_msg:
        error_class = classify_error(error_msg)

    # ── Data source resolution (priority order) ─────────────
    #
    # Priority:  cbom full data
    #         → cbom + probe fallback
    #         → shadow rescue
    #         → error-class inferred scoring
    #         → unreachable (skip)
    #
    working     = dict(asset)
    data_source = "cbom"

    # Level 1: fill missing cipher/KEX from probe details
    if not _str(working, "cipher_suite") or not _str(working, "kex_algo"):
        recovered = _extract_from_best_probe(working)
        if recovered:
            for k, v in recovered.items():
                if k not in working or not working[k]:
                    working[k] = v
            if _str(asset, "cipher_suite") or _str(asset, "kex_algo"):
                pass   # top-level fields existed; just filled gaps
            else:
                data_source = "cbom+probe"

    # Level 2: shadow record rescue for error assets
    if is_scan_error and not _has_any_tls_data(working) and shadow_record:
        shadow_ok = str(_get(shadow_record, "scan_status") or "").lower()
        if shadow_ok == "ok" or _effective_tls(shadow_record) > 0:
            working = dict(shadow_record)
            for keep in ("Asset ID", "Asset", "IP Address", "Port"):
                if keep in asset:
                    working[keep] = asset[keep]
            data_source  = "shadow_rescue"
            is_scan_error = False
            error_class   = None

    # Level 3: probe rescue only (already done above in Level 1)
    if data_source == "cbom+probe":
        pass   # probes already merged

    has_data = _has_any_tls_data(working)

    # ── Level 4: error-class inferred scoring ───────────────
    #
    # If we still have no TLS data but we KNOW why the scan failed,
    # apply conservative scoring instead of leaving it unscored.
    #
    error_defaults = None
    inferred = False

    if is_scan_error and not has_data and error_class:
        score_defaults = _ERROR_SCORE_DEFAULTS.get(error_class)

        if score_defaults is None:
            # HOST_UNREACHABLE — genuinely unscorable
            out.update({
                "HEI_Score":            None,
                "Risk_Category":        "Unscored_Unreachable",
                "MDS_Score":            None,
                "QRMM_Level":           {"level": None, "label": "Unreachable",
                                         "description": "Host is not reachable from scanner. Infrastructure issue, not a cryptographic risk."},
                "Certification_Status": "Unscored_Unreachable",
                "Scoring_Confidence":   "none",
                "Error_Classification": error_class,
                "_PQC_Model_Details":   {},
            })
            return out

        # Apply inferred scoring defaults
        error_defaults = score_defaults
        inferred       = True
        data_source    = f"inferred_{error_class.lower()}"

    elif is_scan_error and not has_data:
        # Truly unknown error — apply worst-case conservative scoring
        error_defaults = _ERROR_SCORE_DEFAULTS["UNKNOWN_ERROR"]
        inferred       = True
        data_source    = "inferred_unknown_error"

    # ── Run the five models ──────────────────────────────────
    if not has_data and not inferred:
        # Absolute fallback — nothing at all
        out.update({
            "HEI_Score":            None,
            "Risk_Category":        "N/A",
            "MDS_Score":            None,
            "QRMM_Level":           {"level": None, "label": "No Data",
                                     "description": error_msg or "No TLS data available."},
            "Certification_Status": "N/A",
            "Scoring_Confidence":   "none",
            "Error_Classification": error_class,
            "_PQC_Model_Details":   {},
        })
        return out

    hei, hei_bd  = compute_hei(working, shadow_findings, error_defaults)
    tls_for_qrmm = hei_bd["tls_version_for_qrmm"]
    uses_pqc     = hei_bd["uses_pqc_kem"]
    uses_hybrid  = hei_bd["uses_hybrid"]
    pfs_present  = hei_bd["pfs_present"]

    mds, mds_fac = compute_mds(working, tls_for_qrmm, shadow_findings, error_class)
    qrmm         = compute_qrmm(tls_for_qrmm, pfs_present, uses_pqc, uses_hybrid)
    cert         = compute_cert_status(hei, uses_pqc, uses_hybrid)

    # Composite prioritisation rank: HEI (urgency) × (1 - MDS/100) × 100
    # High HEI + Low MDS = highest priority (very exposed AND easy to fix)
    # High HEI + High MDS = still urgent but needs planning
    # Formula range: 0 (safe + hard) → 100 (maximally exposed + trivial to fix)
    priority_score = round(hei * (1 - mds / 100), 1) if hei is not None else None

    confidence_map = {
        "cbom":                           "full",
        "cbom+probe":                     "partial_probe",
        "shadow_rescue":                  "partial_shadow",
        "inferred_tls_negotiation_failure": "inferred_tls_failure",
        "inferred_certificate_issue":     "inferred_cert_issue",
        "inferred_timeout":               "inferred_timeout",
        "inferred_unknown_error":         "inferred_unknown",
    }
    confidence = confidence_map.get(data_source, data_source)

    update = {
        "HEI_Score":              hei,
        "Risk_Category":          risk_category(hei),
        "MDS_Score":              mds,
        "QRMM_Level":             qrmm,
        "Certification_Status":   cert,
        "Remediation_Priority":   priority_score,
        "Scoring_Confidence":     confidence,
        "_PQC_Model_Details":   {
            "data_source":   data_source,
            "HEI_breakdown": hei_bd,
            "MDS_factors":   mds_fac,
        },
    }
    if error_class:
        update["Error_Classification"] = error_class
    out.update(update)
    return out


# ─────────────────────────────────────────────────────────────
# JSON root detection
# ─────────────────────────────────────────────────────────────
def _looks_like_asset(obj: dict) -> bool:
    return bool(_ASSET_SIGNALS & obj.keys())


def _find_asset_list(node, depth=0):
    if depth > 3:
        return None
    if isinstance(node, list):
        if node and isinstance(node[0], dict) and _looks_like_asset(node[0]):
            return node
        if node and all(isinstance(x, dict) for x in node[:3]):
            return node
        return None
    if isinstance(node, dict):
        for key in _ARRAY_KEYS:
            candidate = node.get(key)
            if isinstance(candidate, list) and candidate:
                r = _find_asset_list(candidate, depth + 1)
                if r is not None:
                    return r
        for value in node.values():
            if isinstance(value, (list, dict)):
                r = _find_asset_list(value, depth + 1)
                if r is not None:
                    return r
    return None


def extract_assets(data) -> tuple:
    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            return data, data
        raise ValueError("JSON root is an array but contains no objects.")
    if isinstance(data, dict):
        found = _find_asset_list(data)
        if found is not None:
            return found, data
        return [data], data
    raise ValueError(f"Unexpected JSON root type: {type(data).__name__}.")


# ─────────────────────────────────────────────────────────────
# Summary helpers
# ─────────────────────────────────────────────────────────────
def _summary_dict(enriched: list) -> dict:
    scored   = [a for a in enriched if a.get("HEI_Score") is not None]
    heis     = [a["HEI_Score"] for a in scored]
    mdss     = [a["MDS_Score"]  for a in scored]

    def dist(key, labels):
        return {lb: sum(1 for a in enriched if a.get(key) == lb) for lb in labels}

    def hei_stats(subset):
        h = [a["HEI_Score"] for a in subset if a.get("HEI_Score") is not None]
        return {"count": len(h),
                "avg":   round(sum(h)/len(h), 2) if h else None,
                "min":   min(h) if h else None,
                "max":   max(h) if h else None}

    # Confidence breakdown
    confidence_counts: dict = {}
    for a in enriched:
        c = a.get("Scoring_Confidence", "none")
        confidence_counts[c] = confidence_counts.get(c, 0) + 1

    # Error classification breakdown + error message sampling
    error_class_counts: dict = {}
    error_samples: dict = {}   # up to 3 raw error messages per class
    for a in enriched:
        ec  = a.get("Error_Classification")
        msg = str(a.get("Error") or a.get("error") or "").strip()
        if ec:
            error_class_counts[ec] = error_class_counts.get(ec, 0) + 1
            if msg and len(error_samples.get(ec, [])) < 3:
                error_samples.setdefault(ec, [])
                if msg not in error_samples[ec]:
                    error_samples[ec].append(msg)

    unreachable    = sum(1 for a in enriched if a.get("Risk_Category") == "Unscored_Unreachable")
    truly_unscored = sum(1 for a in enriched
                         if a.get("HEI_Score") is None
                         and a.get("Risk_Category") not in ("Unscored_Unreachable",))

    # Confidence-split HEI — separates real data from inferred scores
    full_scored    = [a for a in scored if a.get("Scoring_Confidence") in
                      ("full", "partial_probe", "partial_shadow")]
    inferred_scored = [a for a in scored if a.get("Scoring_Confidence", "").startswith("inferred")]

    # Certificate expiry tracking
    import datetime
    now = datetime.datetime.now()
    expiry_counts = {"expired": 0, "within_30d": 0, "within_90d": 0,
                     "within_365d": 0, "ok": 0, "unknown": 0}
    for a in enriched:
        validity = a.get("Certificate Validity (Not Before/After)") or {}
        not_after_str = str(validity.get("Not After") or validity.get("not_after") or "")
        if not not_after_str:
            expiry_counts["unknown"] += 1
            continue
        try:
            import re as _re
            clean = _re.sub(r"[+-]\d{2}:\d{2}$", "", not_after_str.replace("Z", ""))
            not_after = datetime.datetime.fromisoformat(clean)
            days = (not_after - now).days
            if   days < 0:    expiry_counts["expired"]    += 1
            elif days < 30:   expiry_counts["within_30d"] += 1
            elif days < 90:   expiry_counts["within_90d"] += 1
            elif days < 365:  expiry_counts["within_365d"]+= 1
            else:             expiry_counts["ok"]         += 1
        except (ValueError, TypeError):
            expiry_counts["unknown"] += 1

    # Top-10 by Remediation_Priority — deduplicated by hostname.
    # The scanner creates one entry per IP:port per hostname, so the same
    # FQDN can appear dozens of times with identical scores.
    # We keep the worst (highest HEI) record per unique hostname first,
    # then rank unique hostnames by priority score.
    seen_hosts = {}
    for a in full_scored:
        if a.get("Remediation_Priority") is None:
            continue
        hostname = str(a.get("Asset") or a.get("asset") or "").strip().lower()
        existing = seen_hosts.get(hostname)
        if existing is None or (a.get("HEI_Score") or 0) >= (existing.get("HEI_Score") or 0):
            seen_hosts[hostname] = a

    top_priority = sorted(
        seen_hosts.values(),
        key=lambda a: a.get("Remediation_Priority", 0),
        reverse=True
    )[:10]

    top_priority_list = [
        {
            "asset":       str(a.get("Asset") or a.get("asset") or "?"),
            "port":        a.get("Port") or a.get("port") or 443,
            "HEI":         a.get("HEI_Score"),
            "MDS":         a.get("MDS_Score"),
            "priority":    a.get("Remediation_Priority"),
            "QRMM":        a.get("QRMM_Level", {}).get("level"),
            "QRMM_label":  a.get("QRMM_Level", {}).get("label", ""),
            "confidence":  a.get("Scoring_Confidence"),
            "error_class": a.get("Error_Classification"),
        }
        for a in top_priority
    ]

    # Shadow-adjusted count: how many had their HEI changed by shadow bonuses
    shadow_adjusted = sum(
        1 for a in enriched
        if a.get("_PQC_Model_Details", {})
               .get("HEI_breakdown", {})
               .get("shadow_hei_bonus", 0) > 0
    )

    return {
        "total_assets":           len(enriched),
        "scored":                 len(scored),
        "scored_full_data":       len(full_scored),
        "scored_inferred":        len(inferred_scored),
        "unscored_unreachable":   unreachable,
        "unscored_no_data":       truly_unscored,
        "shadow_annotated":       sum(1 for a in enriched if a.get("Shadow_Crypto_Findings")),
        "shadow_hei_adjusted":    shadow_adjusted,
        "scoring_confidence":     confidence_counts,
        "error_classification":   error_class_counts,
        "error_samples":          error_samples,
        "HEI_all_scored":         hei_stats(scored),
        "HEI_full_data_only":     hei_stats(full_scored),
        "HEI_inferred_only":      hei_stats(inferred_scored),
        "HEI": hei_stats(scored),   # kept for backward compatibility
        "MDS": {"avg": round(sum(mdss)/len(mdss), 2) if mdss else None,
                "min": min(mdss) if mdss else None,
                "max": max(mdss) if mdss else None},
        "cert_expiry":            expiry_counts,
        "top10_by_priority":      top_priority_list,
        "risk_distribution": dist("Risk_Category",
                                  ["Low", "Moderate", "High", "Critical"]),
        "cert_distribution": dist("Certification_Status",
                                  ["PQC Ready", "Hybrid Secure", "Not Quantum Safe"]),
        "qrmm_distribution": {
            f"Level_{lvl}": sum(
                1 for a in scored
                if isinstance(a.get("QRMM_Level"), dict)
                and a["QRMM_Level"].get("level") == lvl)
            for lvl in range(4)},
    }


def _print_summary(label: str, enriched: list) -> None:
    s    = _summary_dict(enriched)
    W    = 64
    div  = "+" + "-" * W + "+"
    conf = s["scoring_confidence"]
    ecls = s["error_classification"]
    esmp = s.get("error_samples", {})

    def row(lbl, val, indent=0):
        pad = "  " * indent
        return f"| {pad}{lbl:<{36 - len(pad)}} {str(val):<{W - 39}} |"

    def hrow(stats, label_prefix=""):
        if not stats or stats.get("avg") is None:
            return row(f"{label_prefix}avg / min / max", "-")
        return row(f"{label_prefix}avg / min / max",
                   f"{stats['avg']} / {stats['min']} / {stats['max']}  (n={stats['count']})")

    lines = [
        div,
        f"|  {label:<{W - 2}}|",
        div,
        row("Total assets", s["total_assets"]),
        div,
        f"|{'  Scoring Breakdown':^{W}}|",
        row("  Scored (have HEI)", s["scored"]),
        row("    Full/partial data", s.get("scored_full_data", 0)),
        row("      Full (cbom)", conf.get("full", 0)),
        row("      Probe rescue", conf.get("partial_probe", 0)),
        row("      Shadow rescue", conf.get("partial_shadow", 0)),
        row("    Inferred (no direct data)", s.get("scored_inferred", 0)),
        row("      TLS failure → HEI=100", conf.get("inferred_tls_failure", 0)),
        row("      Cert issue → moderate", conf.get("inferred_cert_issue", 0)),
        row("      Timeout → HEI=95",     conf.get("inferred_timeout", 0)),
        row("      Unknown → HEI=95",     conf.get("inferred_unknown", 0)),
        row("  Unscored (host unreachable)", s["unscored_unreachable"]),
        row("  Unscored (no data at all)",   s["unscored_no_data"]),
        row("  Shadow-crypto annotated",     s["shadow_annotated"]),
        row("  Shadow-adjusted HEI score",   s.get("shadow_hei_adjusted", 0)),
        div,
        f"|{'  HEI — split by data quality':^{W}}|",
        hrow(s["HEI_full_data_only"], "Real data   "),
        hrow(s["HEI_inferred_only"],  "Inferred    "),
        hrow(s["HEI_all_scored"],     "Combined    "),
        row("MDS avg / min / max",
            f"{s['MDS']['avg']} / {s['MDS']['min']} / {s['MDS']['max']}"
            if s["MDS"]["avg"] else "-"),
        div,
        f"|{'  Certificate Expiry':^{W}}|",
        row("  Already expired",    s["cert_expiry"]["expired"]),
        row("  Expires < 30 days",  s["cert_expiry"]["within_30d"]),
        row("  Expires 30–90 days", s["cert_expiry"]["within_90d"]),
        row("  Expires 90–365 days",s["cert_expiry"]["within_365d"]),
        row("  OK (> 1 year)",      s["cert_expiry"]["ok"]),
        row("  No cert data",       s["cert_expiry"]["unknown"]),
        div,
        f"|{'  Error Classification':^{W}}|",
    ]
    for ec_name, ec_count in sorted(ecls.items(), key=lambda x: -x[1]):
        lines.append(row(f"  {ec_name}", ec_count))
        for sample in esmp.get(ec_name, [])[:2]:
            short = (sample[:52] + "...") if len(sample) > 55 else sample
            lines.append(f"|    {short:<{W - 4}}|")
    lines += [
        div,
        f"|{'  Risk (all scored)':^{W}}|",
        row("  Low (0-25)",        s["risk_distribution"]["Low"]),
        row("  Moderate (26-50)",  s["risk_distribution"]["Moderate"]),
        row("  High (51-75)",      s["risk_distribution"]["High"]),
        row("  Critical (76-100)", s["risk_distribution"]["Critical"]),
        div,
        f"|{'  Certification':^{W}}|",
        row("  PQC Ready",         s["cert_distribution"]["PQC Ready"]),
        row("  Hybrid Secure",     s["cert_distribution"]["Hybrid Secure"]),
        row("  Not Quantum Safe",  s["cert_distribution"]["Not Quantum Safe"]),
        div,
        f"|{'  QRMM Maturity':^{W}}|",
        row("  Level 0 - Classical Insecure",   s["qrmm_distribution"]["Level_0"]),
        row("  Level 1 - Strong Classical+PFS", s["qrmm_distribution"]["Level_1"]),
        row("  Level 2 - Hybrid",               s["qrmm_distribution"]["Level_2"]),
        row("  Level 3 - Fully PQC",            s["qrmm_distribution"]["Level_3"]),
        div,
    ]
    top = s.get("top10_by_priority", [])
    if top:
        lines.append(f"|{'  Top 10 priority assets — unique hostnames, real data only':^{W}}|")
        lines.append(f"| {'Asset':<34} HEI   MDS   Priority  Level |")
        lines.append(div)
        for t in top[:10]:
            name = str(t["asset"])[:33]
            lvl  = f"L{t['QRMM']}" if t["QRMM"] is not None else "?"
            lines.append(
                f"| {name:<34} "
                f"{str(t['HEI']):<6}"
                f"{str(t['MDS']):<6}"
                f"{str(t['priority']):<10}"
                f"{lvl}  |"
            )
        lines.append(div)
        lines.append(f"|  Tip: each line is a unique FQDN. Port details in enriched JSON.{" " * (W - 65)}|")
    _err("\n".join(lines))


# ─────────────────────────────────────────────────────────────
# Core: load → enrich → save
# ─────────────────────────────────────────────────────────────
def process_file(input_path: Path, output_path: Path, dry_run=False) -> bool:
    label = f"{input_path.parent.name}/{input_path.name}"

    if dry_run:
        _err(f"  [dry-run] Would enrich: {input_path}")
        shadow = input_path.parent / "shadow-crypto.json"
        if shadow.exists():
            _err(f"  [dry-run] Would also load: {shadow}")
        return True

    with input_path.open("r", encoding="utf-8-sig") as fh:
        try:
            raw = json.load(fh)
        except json.JSONDecodeError as exc:
            _err(f"  ERROR: invalid JSON in {input_path} -- {exc}")
            return False

    assets, root = extract_assets(raw)
    if not assets:
        _err(f"  ERROR: no asset objects found in {input_path}")
        return False

    findings_by_asset, records_by_asset = load_shadow_crypto(input_path.parent)

    _err(f"  Enriching {len(assets)} asset(s) from {label} ...")
    enriched = []
    for a in assets:
        key = _asset_key(a)
        enriched.append(enrich(
            a,
            shadow_findings=findings_by_asset.get(key),
            shadow_record=records_by_asset.get(key),
        ))

    if isinstance(raw, list):
        output = {"enriched_assets": enriched,
                  "_PQC_Enrichment_Summary": _summary_dict(enriched)}
    elif isinstance(raw, dict):
        output = dict(raw)
        for key in _ARRAY_KEYS:
            if isinstance(raw.get(key), list):
                output[key] = enriched
                break
        else:
            output = enriched[0] if len(enriched) == 1 else {
                "enriched_assets": enriched,
                "_PQC_Enrichment_Summary": _summary_dict(enriched)}
        if len(enriched) > 1:
            output["_PQC_Enrichment_Summary"] = _summary_dict(enriched)
    else:
        output = enriched

    output_path.write_bytes(
        json.dumps(output, indent=2, ensure_ascii=False, default=str).encode("utf-8"))
    _err(f"  Saved -> {output_path}")
    _print_summary(label, enriched)
    return True


# ─────────────────────────────────────────────────────────────
# Batch mode
# ─────────────────────────────────────────────────────────────
def find_cbom_files(root: Path) -> list:
    return sorted(p for p in root.rglob("cbom.json")
                  if p.name != "enriched_cbom.json")


# ─────────────────────────────────────────────────────────────
# Debug helper
# ─────────────────────────────────────────────────────────────
def _debug_structure(data, indent=0, max_depth=4):
    pad = "  " * indent
    if indent > max_depth:
        _err(f"{pad}...")
        return
    if isinstance(data, dict):
        _err(f"{pad}object ({len(data)} keys): {list(data.keys())[:8]}")
        for k, v in list(data.items())[:5]:
            _err(f"{pad}  [{k!r}]:")
            _debug_structure(v, indent + 2, max_depth)
    elif isinstance(data, list):
        _err(f"{pad}array ({len(data)} items)")
        if data:
            _err(f"{pad}  [0]:")
            _debug_structure(data[0], indent + 2, max_depth)
    else:
        _err(f"{pad}{type(data).__name__}: {str(data)[:80]!r}")


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
HELP = """
Usage (always from PNB-QRIE/ root):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  python3 pqc_enrichment.py PNB/cbom.json PNB/enriched_cbom.json
  python3 pqc_enrichment.py PNB/
  python3 pqc_enrichment.py --all
  python3 pqc_enrichment.py --all /custom/root

Flags:  --debug    show JSON structure of a file and exit
        --dry-run  list files without writing anything
"""


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        _err(HELP)
        sys.exit(0 if args else 1)

    dry_run = "--dry-run" in args
    debug   = "--debug"   in args
    args    = [a for a in args if a not in ("--dry-run", "--debug")]

    if args and args[0] == "--all":
        root = Path(args[1]) if len(args) > 1 else Path.cwd()
        if not root.is_dir():
            _err(f"Error: not a directory -- {root}")
            sys.exit(1)
        cbom_files = find_cbom_files(root)
        if not cbom_files:
            _err(f"No cbom.json files found under {root}")
            sys.exit(1)
        _err(f"\nBatch mode: {len(cbom_files)} cbom.json file(s)\n")
        success = failed = 0
        for cbom in cbom_files:
            ok = process_file(cbom, cbom.parent / "enriched_cbom.json", dry_run)
            if ok: success += 1
            else:  failed  += 1
        _err(f"\nBatch complete: {success} succeeded, {failed} failed.")
        sys.exit(0 if failed == 0 else 1)

    if not args:
        _err(HELP)
        sys.exit(1)

    target = Path(args[0])

    if target.is_dir():
        cbom = target / "cbom.json"
        if not cbom.exists():
            _err(f"Error: no cbom.json in {target}")
            sys.exit(1)
        if debug:
            _err("\n--- JSON root structure ---")
            _debug_structure(json.loads(cbom.read_bytes()))
            sys.exit(0)
        ok = process_file(cbom, target / "enriched_cbom.json", dry_run)
        sys.exit(0 if ok else 1)

    if not target.exists():
        _err(f"Error: file not found -- {target}")
        _err("Tip: run from the PNB-QRIE/ root, e.g.")
        _err("       python3 pqc_enrichment.py PNB/cbom.json")
        sys.exit(1)

    if debug:
        _err("\n--- JSON root structure ---")
        _debug_structure(json.loads(target.read_bytes()))
        sys.exit(0)

    out = Path(args[1]) if len(args) >= 2 else target.parent / "enriched_cbom.json"
    ok  = process_file(target, out, dry_run)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()