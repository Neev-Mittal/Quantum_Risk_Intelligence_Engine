
from __future__ import annotations

import asyncio
import collections
import html
import ipaddress
import json
import os
import re
import socket
import ssl
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator
from starlette.middleware.base import BaseHTTPMiddleware

# ═══════════════════════════════════════════════════════════════
# Configuration — all tunables read from environment variables
# ═══════════════════════════════════════════════════════════════
_CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://localhost:4173",
    ).split(",")
    if o.strip()
]
_API_KEY: str | None = os.environ.get("SCANNER_API_KEY")  # None = auth disabled
_RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "10"))  # requests per window
_RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))  # seconds
_ALLOW_INTERNAL_SCAN = os.environ.get("ALLOW_INTERNAL_SCAN", "false").lower() == "true"
_MAX_TARGETS = int(os.environ.get("MAX_TARGETS", "200"))
_MAX_PORTS = int(os.environ.get("MAX_PORTS", "20"))
_ALLOWED_OUTPUT_BASE = Path(os.environ.get("OUTPUT_BASE_DIR", ".")).resolve()

# ═══════════════════════════════════════════════════════════════
# App & middleware
# ═══════════════════════════════════════════════════════════════
app = FastAPI(
    title="QRIE Scanner API",
    version="3.0.0",
    docs_url=None if _API_KEY else "/docs",      # hide docs when auth is on
    redoc_url=None if _API_KEY else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    allow_credentials=False,
)


# ── Security headers middleware ──────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── Rate limiter (in-memory, per-IP) ─────────────────────────────
_rate_store: dict[str, collections.deque] = {}


def _check_rate_limit(request: Request) -> None:
    """Raise 429 if the caller exceeds the configured rate limit."""
    if _RATE_LIMIT_MAX <= 0:
        return
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = _rate_store.setdefault(client_ip, collections.deque())
    # Evict old entries
    while window and window[0] < now - _RATE_LIMIT_WINDOW:
        window.popleft()
    if len(window) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {_RATE_LIMIT_MAX} requests per {_RATE_LIMIT_WINDOW}s.",
        )
    window.append(now)


# ── Optional API-key auth ────────────────────────────────────────
def _verify_api_key(request: Request) -> None:
    """Raise 401 if an API key is configured but the request doesn't supply it."""
    if _API_KEY is None:
        return  # auth disabled
    provided = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if provided != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# ── SSRF protection ──────────────────────────────────────────────
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_private_ip(addr: str) -> bool:
    """Return True when *addr* falls into a private/loopback/link-local range."""
    try:
        ip = ipaddress.ip_address(addr)
        return any(ip in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        return False


def _validate_target_ssrf(target: str) -> bool:
    """Return True when *target* is safe to scan (i.e. not internal)."""
    if _ALLOW_INTERNAL_SCAN:
        return True
    if _is_private_ip(target):
        return False
    # Resolve hostname and check resulting IP too
    try:
        infos = socket.getaddrinfo(target, None, proto=socket.IPPROTO_TCP)
        for info in infos:
            if _is_private_ip(info[4][0]):
                return False
    except Exception:
        pass  # unresolvable hosts are allowed (they'll fail during scan)
    return True


# ── Path traversal protection ────────────────────────────────────
def _validate_output_dir(raw: str) -> Path:
    """Resolve *raw* into a safe output directory under the allowed base."""
    candidate = (_ALLOWED_OUTPUT_BASE / raw).resolve()
    # Ensure the resolved path starts with the allowed base
    try:
        candidate.relative_to(_ALLOWED_OUTPUT_BASE)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"output_dir escapes the allowed base directory.",
        )
    return candidate


# ── Deterministic Asset ID ───────────────────────────────────────
_ASSET_UUID_NAMESPACE = uuid.UUID("a4e3f6c1-7b2d-4e89-9f01-2c3d5e6f7a8b")


def _deterministic_asset_id(host: str, port: int) -> str:
    """Generate a stable UUID5 for a (host, port) pair so re-scans produce the same ID."""
    return str(uuid.uuid5(_ASSET_UUID_NAMESPACE, f"{host}:{port}"))


# -----------------------------
# Request model
# -----------------------------
class ScanRequest(BaseModel):
    targets: list[str]
    ports: list[int] = [443]
    tls_timeout: float = 6.0
    resolve_timeout: float = 5.0
    enumerate_subdomains: bool = False
    output_dir: str = "."
    write_files: bool = True

    @field_validator("targets")
    @classmethod
    def validate_targets(cls, v: list[str]) -> list[str]:
        if len(v) > _MAX_TARGETS:
            raise ValueError(f"Too many targets (max {_MAX_TARGETS}).")
        if not v:
            raise ValueError("At least one target is required.")
        host_re = re.compile(r"^[a-zA-Z0-9._:-]+$")
        for t in v:
            if not host_re.match(t):
                raise ValueError(f"Invalid target format: {t!r}")
        return v

    @field_validator("ports")
    @classmethod
    def validate_ports(cls, v: list[int]) -> list[int]:
        if len(v) > _MAX_PORTS:
            raise ValueError(f"Too many ports (max {_MAX_PORTS}).")
        for p in v:
            if not (1 <= p <= 65535):
                raise ValueError(f"Port out of range: {p}")
        return v

    @field_validator("tls_timeout")
    @classmethod
    def validate_tls_timeout(cls, v: float) -> float:
        if v <= 0 or v > 30:
            raise ValueError("tls_timeout must be between 0 and 30 seconds.")
        return v

    @field_validator("resolve_timeout")
    @classmethod
    def validate_resolve_timeout(cls, v: float) -> float:
        if v <= 0 or v > 30:
            raise ValueError("resolve_timeout must be between 0 and 30 seconds.")
        return v

    @field_validator("output_dir")
    @classmethod
    def validate_output_dir(cls, v: str) -> str:
        if ".." in v:
            raise ValueError("output_dir must not contain '..'.")
        if len(v) > 256:
            raise ValueError("output_dir is too long (max 256 chars).")
        return v


# -----------------------------
# TLS helpers
# -----------------------------
TLS_VERSION_MAP = {
    ssl.TLSVersion.TLSv1: "TLSv1.0",
    ssl.TLSVersion.TLSv1_1: "TLSv1.1",
    ssl.TLSVersion.TLSv1_2: "TLSv1.2",
    ssl.TLSVersion.TLSv1_3: "TLSv1.3",
}

TLS_PROBE_ORDER = ["TLSv1.0", "TLSv1.1", "TLSv1.2", "TLSv1.3"]

TLS_VERSION_CONSTS = {
    "TLSv1.0": (ssl.TLSVersion.TLSv1, ssl.TLSVersion.TLSv1),
    "TLSv1.1": (ssl.TLSVersion.TLSv1_1, ssl.TLSVersion.TLSv1_1),
    "TLSv1.2": (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2),
    "TLSv1.3": (ssl.TLSVersion.TLSv1_3, ssl.TLSVersion.TLSv1_3),
}

PFS_KEX = {"ECDHE", "DHE", "EDH"}

WEAK_CIPHER_MARKERS = (
    "NULL",
    "RC4",
    "DES",
    "3DES",
    "EXPORT",
    "MD5",
    "SHA1",
    "ANON",
)

CMS_HINTS = {
    "wordpress": "WordPress",
    "drupal": "Drupal",
    "joomla": "Joomla",
    "magento": "Magento",
    "shopify": "Shopify",
    "prestashop": "PrestaShop",
    "typo3": "TYPO3",
    "ghost": "Ghost",
}

TECH_HINTS = {
    "nginx": "Nginx",
    "apache": "Apache",
    "openresty": "OpenResty",
    "caddy": "Caddy",
    "lighttpd": "Lighttpd",
    "iis": "Microsoft IIS",
    "microsoft-iis": "Microsoft IIS",
    "gunicorn": "Gunicorn",
    "uwsgi": "uWSGI",
    "uvicorn": "Uvicorn",
    "tomcat": "Apache Tomcat",
    "jetty": "Jetty",
    "envoy": "Envoy",
    "cloudflare": "Cloudflare",
    "varnish": "Varnish",
    "express": "Express",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "php": "PHP",
    "asp.net": "ASP.NET",
    "django": "Django",
    "laravel": "Laravel",
    "spring": "Spring",
}

OS_HINTS = {
    "windows": "Windows",
    "microsoft iis": "Windows",
    "asp.net": "Windows",
    "ubuntu": "Ubuntu / Linux",
    "debian": "Debian / Linux",
    "centos": "CentOS / Linux",
    "red hat": "Red Hat / Linux",
    "fedora": "Fedora / Linux",
    "alpine": "Alpine / Linux",
    "linux": "Linux / Unix",
    "unix": "Unix",
    "freebsd": "FreeBSD",
    "openbsd": "OpenBSD",
    "mac os": "macOS",
    "darwin": "macOS",
}

# ═══════════════════════════════════════════════════════════════
# Asset Classification Engine
# ═══════════════════════════════════════════════════════════════

# ── CDN / WAF / Proxy detection ──────────────────────────────────
CDN_WAF_HINTS: dict[str, str] = {
    "cloudflare": "Cloudflare",
    "cf-ray": "Cloudflare",
    "cf-cache-status": "Cloudflare",
    "akamai": "Akamai",
    "x-akamai": "Akamai",
    "x-akamai-transformed": "Akamai",
    "fastly": "Fastly",
    "x-fastly": "Fastly",
    "x-cache-hits": "Fastly",
    "x-cdn": "CDN (Generic)",
    "x-served-by": "CDN (Generic)",
    "cloudfront": "AWS CloudFront",
    "x-amz-cf": "AWS CloudFront",
    "x-azure-ref": "Azure CDN / Front Door",
    "x-ms-ref": "Azure CDN / Front Door",
    "x-sucuri": "Sucuri WAF",
    "x-sucuri-id": "Sucuri WAF",
    "server: imperva": "Imperva",
    "x-iinfo": "Imperva / Incapsula",
    "x-cdn-geo": "CDN (Generic)",
    "x-cache": "CDN Cache",
    "x-varnish": "Varnish",
    "via": "Proxy / CDN",
}

# ── Database service ports ───────────────────────────────────────
DB_SERVICE_PORTS: dict[int, str] = {
    3306: "MySQL",
    5432: "PostgreSQL",
    27017: "MongoDB",
    27018: "MongoDB (Shard)",
    27019: "MongoDB (Config)",
    6379: "Redis",
    6380: "Redis (TLS)",
    9200: "Elasticsearch (HTTP)",
    9300: "Elasticsearch (Transport)",
    5984: "CouchDB",
    7474: "Neo4j",
    8529: "ArangoDB",
    1433: "Microsoft SQL Server",
    1521: "Oracle DB",
    5439: "Amazon Redshift",
    9042: "Cassandra",
    2181: "ZooKeeper",
    11211: "Memcached",
    26257: "CockroachDB",
}

# ── Mail server patterns ────────────────────────────────────────
MAIL_SUBDOMAIN_PATTERNS = {"mail", "smtp", "mx", "imap", "pop3", "exchange", "webmail", "owa"}
MAIL_PORTS = {25, 465, 587, 993, 995, 143, 110}

# ── DNS server patterns ─────────────────────────────────────────
DNS_SUBDOMAIN_PATTERNS = {"ns", "ns1", "ns2", "ns3", "ns4", "dns", "nameserver", "resolver"}
DNS_PORTS = {53}

# ── Well-known port → service mapping ───────────────────────────
PORT_SERVICE_MAP: dict[int, tuple[str, str]] = {
    # (service_name, port_category)
    21: ("FTP", "file_transfer"),
    22: ("SSH", "remote_access"),
    23: ("Telnet", "remote_access"),
    25: ("SMTP", "mail"),
    53: ("DNS", "dns"),
    80: ("HTTP", "web"),
    110: ("POP3", "mail"),
    143: ("IMAP", "mail"),
    389: ("LDAP", "directory"),
    443: ("HTTPS", "web"),
    445: ("SMB", "file_transfer"),
    465: ("SMTPS", "mail"),
    587: ("SMTP Submission", "mail"),
    636: ("LDAPS", "directory"),
    993: ("IMAPS", "mail"),
    995: ("POP3S", "mail"),
    1080: ("SOCKS Proxy", "proxy"),
    1433: ("MSSQL", "database"),
    1521: ("Oracle", "database"),
    2181: ("ZooKeeper", "middleware"),
    2379: ("etcd", "middleware"),
    3306: ("MySQL", "database"),
    3389: ("RDP", "remote_access"),
    5432: ("PostgreSQL", "database"),
    5672: ("AMQP / RabbitMQ", "middleware"),
    5984: ("CouchDB", "database"),
    6379: ("Redis", "database"),
    6380: ("Redis TLS", "database"),
    8080: ("HTTP Alt", "web"),
    8443: ("HTTPS Alt", "web"),
    9042: ("Cassandra", "database"),
    9090: ("Prometheus", "monitoring"),
    9200: ("Elasticsearch", "database"),
    9300: ("Elasticsearch Transport", "database"),
    9418: ("Git", "development"),
    11211: ("Memcached", "database"),
    15672: ("RabbitMQ Mgmt", "middleware"),
    27017: ("MongoDB", "database"),
    27018: ("MongoDB Shard", "database"),
    27019: ("MongoDB Config", "database"),
}

# ── API subdomain / path patterns ───────────────────────────────
API_SUBDOMAIN_PATTERNS = {
    "api", "gateway", "graphql", "rest", "ws", "websocket",
    "apim", "apigateway", "apigw", "api-gw", "service",
    "grpc", "rpc", "webhook", "webhooks",
}

API_HEADER_INDICATORS = {
    "x-ratelimit-limit", "x-ratelimit-remaining", "x-rate-limit",
    "x-api-version", "x-request-id", "x-correlation-id",
    "access-control-allow-methods", "access-control-allow-headers",
}

API_BODY_INDICATORS = [
    "swagger", "openapi", "graphql", '"error":', '"message":',
    '"status":', '"data":', '"result":', '"results":',
    '"api_version"', '"version":', "wsdl", "xmlns:soap",
]


# ── SSL detail extraction ───────────────────────────────────────
def extract_ssl_details(der_cert: bytes | None, tls_version: str | None,
                        cipher_suite: str | None,
                        cert_info: dict) -> dict:
    """Extract extended SSL certificate details for the enriched output."""
    result: dict[str, Any] = {
        "protocol_version": tls_version,
        "cipher_strength": _classify_cipher_strength(cipher_suite),
        "sans": [],
        "is_wildcard": False,
        "is_ev": False,
        "ct_logged": False,
        "days_until_expiry": None,
    }

    if not der_cert:
        return result

    try:
        from cryptography import x509

        cert = x509.load_der_x509_certificate(der_cert)

        # Subject Alternative Names
        try:
            san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            sans = san_ext.value.get_values_for_type(x509.DNSName)
            result["sans"] = sans
            result["is_wildcard"] = any(s.startswith("*.") for s in sans)
        except x509.ExtensionNotFound:
            pass

        # Extended Validation detection
        try:
            policies = cert.extensions.get_extension_for_class(x509.CertificatePolicies)
            ev_oids = {
                "2.16.840.1.114412.2.1",   # DigiCert EV
                "1.3.6.1.4.1.34697.2.1",   # AffirmTrust EV
                "2.16.840.1.113733.1.7.23.6",  # VeriSign/Symantec EV
                "1.3.6.1.4.1.6449.1.2.1.5.1",  # Comodo/Sectigo EV
                "2.16.840.1.114028.10.1.2",  # Entrust EV
                "1.3.6.1.4.1.14370.1.6",   # GeoTrust EV
                "2.16.840.1.114413.1.7.23.3",  # GoDaddy EV
                "2.16.756.1.89.1.2.1.1",   # SwissSign EV
                "1.3.6.1.4.1.4146.1.1",    # GlobalSign EV
            }
            for policy in policies.value:
                if policy.policy_identifier.dotted_string in ev_oids:
                    result["is_ev"] = True
                    break
        except (x509.ExtensionNotFound, Exception):
            pass

        # Certificate Transparency
        try:
            cert.extensions.get_extension_for_class(
                x509.PrecertificateSignedCertificateTimestamps
            )
            result["ct_logged"] = True
        except (x509.ExtensionNotFound, Exception):
            pass

        # Days until expiry
        try:
            not_after = cert.not_valid_after_utc
            days = (not_after - datetime.now(timezone.utc)).days
            result["days_until_expiry"] = days
        except Exception:
            pass

    except ImportError:
        pass
    except Exception:
        pass

    return result


def _classify_cipher_strength(cipher_suite: str | None) -> str:
    """Classify cipher strength as Strong/Moderate/Weak/Unknown."""
    if not cipher_suite:
        return "Unknown"
    upper = cipher_suite.upper()
    # Weak
    if any(m in upper for m in ("NULL", "RC4", "DES", "3DES", "EXPORT", "MD5", "ANON")):
        return "Weak"
    # Strong
    if any(m in upper for m in ("AES_256", "CHACHA20", "AES-256")):
        return "Strong"
    # Moderate (AES-128, etc.)
    if any(m in upper for m in ("AES_128", "AES-128", "AES", "GCM")):
        return "Moderate"
    return "Unknown"


# ── API indicator detection ─────────────────────────────────────
def detect_api_indicators(host: str, port: int, headers: dict,
                          body: str, http_status: int | None) -> dict:
    """Detect whether the asset is an API endpoint and classify it."""
    normalized_headers = {str(k).lower(): str(v) for k, v in headers.items()}
    host_lower = host.lower()
    body_lower = (body or "").lower()

    is_api = False
    api_type: str | None = None
    indicators: list[str] = []

    # 1. Subdomain-based detection
    first_label = host_lower.split(".")[0] if "." in host_lower else host_lower
    if first_label in API_SUBDOMAIN_PATTERNS:
        is_api = True
        indicators.append(f"subdomain_pattern: {first_label}")

    # 2. Header-based detection
    for header in API_HEADER_INDICATORS:
        if header in normalized_headers:
            is_api = True
            indicators.append(f"header: {header}")

    # 3. Content-type detection
    content_type = normalized_headers.get("content-type", "")
    if "application/json" in content_type or "application/xml" in content_type:
        if http_status and http_status not in {301, 302, 303, 307, 308}:
            is_api = True
            indicators.append(f"content_type: {content_type.split(';')[0]}")

    # 4. Body pattern detection
    for pattern in API_BODY_INDICATORS:
        if pattern in body_lower:
            is_api = True
            indicators.append(f"body_pattern: {pattern}")
            break

    # 5. Classify API type
    if is_api:
        if "graphql" in host_lower or "graphql" in body_lower:
            api_type = "GraphQL"
        elif "grpc" in host_lower:
            api_type = "gRPC"
        elif "wsdl" in body_lower or "xmlns:soap" in body_lower:
            api_type = "SOAP/XML"
        else:
            api_type = "REST"

    rate_limited = any(k.startswith("x-ratelimit") or k.startswith("x-rate-limit")
                       for k in normalized_headers)
    versioned = bool(re.search(r"/v\d+", normalized_headers.get("x-api-version", "")))

    return {
        "is_api": is_api,
        "api_type": api_type,
        "rate_limited": rate_limited,
        "versioned": versioned,
        "indicators": indicators[:5],  # cap to avoid bloat
    }


# ── Infrastructure detection ────────────────────────────────────
def detect_infrastructure(headers: dict, body: str,
                          server_header: str | None) -> dict:
    """Detect CDN, WAF, proxy, and load balancer usage from headers."""
    normalized_headers = {str(k).lower(): str(v).lower() for k, v in headers.items()}
    header_blob = " ".join(f"{k}: {v}" for k, v in normalized_headers.items())
    body_lower = (body or "").lower()

    cdn_provider: str | None = None
    waf_detected = False
    load_balanced = False
    reverse_proxy = False
    detected_infra: list[str] = []

    # CDN / WAF / Proxy from headers
    for needle, label in CDN_WAF_HINTS.items():
        if needle in header_blob or needle in body_lower:
            detected_infra.append(label)
            if "waf" in label.lower():
                waf_detected = True
            if cdn_provider is None and label != "CDN Cache":
                cdn_provider = label

    # Load balancer detection
    lb_headers = {"x-forwarded-for", "x-forwarded-proto", "x-load-balancer",
                  "x-real-ip", "x-original-forwarded-for"}
    if any(h in normalized_headers for h in lb_headers):
        load_balanced = True

    # Reverse proxy detection
    if "via" in normalized_headers or "x-forwarded-host" in normalized_headers:
        reverse_proxy = True

    # Server header hints
    sl = (server_header or "").lower()
    if "cloudflare" in sl:
        cdn_provider = cdn_provider or "Cloudflare"
        waf_detected = True
    if "imperva" in sl or "incapsula" in sl:
        cdn_provider = cdn_provider or "Imperva"
        waf_detected = True
    if "f5" in sl or "bigip" in sl or "big-ip" in sl:
        load_balanced = True
        detected_infra.append("F5 BIG-IP")

    # Deduplicate
    detected_infra = list(dict.fromkeys(detected_infra))

    return {
        "cdn_provider": cdn_provider,
        "waf_detected": waf_detected,
        "load_balanced": load_balanced,
        "reverse_proxy": reverse_proxy,
        "detected_services": detected_infra[:10],
    }


# ── Network service classification ──────────────────────────────
def classify_network_service(ip: str | None, port: int) -> dict:
    """Classify the network service by port and compute the IP subnet."""
    service_info = PORT_SERVICE_MAP.get(port)
    service_type = service_info[0] if service_info else f"Port-{port}"
    port_category = service_info[1] if service_info else "other"

    ip_subnet: str | None = None
    if ip:
        try:
            addr = ipaddress.ip_address(ip)
            if isinstance(addr, ipaddress.IPv4Address):
                # /24 subnet
                network = ipaddress.ip_network(f"{ip}/24", strict=False)
                ip_subnet = str(network)
            else:
                network = ipaddress.ip_network(f"{ip}/48", strict=False)
                ip_subnet = str(network)
        except ValueError:
            pass

    return {
        "ip_subnet": ip_subnet,
        "service_type": service_type,
        "port_category": port_category,
    }


# ── Master asset type classifier ────────────────────────────────
def classify_asset_type(
    host: str,
    port: int,
    ip: str | None,
    tls_supported: bool,
    http_fp: dict,
    api_details: dict,
    infra_details: dict,
    cert_info: dict,
) -> dict:
    """
    Classify an asset into a primary type and optional secondary types.

    Returns:
        {
            "primary_type": "web_application",
            "secondary_types": ["cdn_proxy"],
            "detection_method": "...",
            "confidence": "high" | "medium" | "low"
        }
    """
    host_lower = host.lower()
    first_label = host_lower.split(".")[0] if "." in host_lower else host_lower
    secondary_types: list[str] = []
    detection_method = "rule_based"
    confidence = "medium"

    http_status = http_fp.get("status")
    content_type = ""
    if http_fp.get("headers"):
        headers_lower = {str(k).lower(): str(v) for k, v in http_fp["headers"].items()}
        content_type = headers_lower.get("content-type", "")

    body = http_fp.get("body_snippet", "")

    # ── Priority 1: Database service ──────────────────────────────
    if port in DB_SERVICE_PORTS:
        return {
            "primary_type": "database",
            "secondary_types": [],
            "detection_method": f"port_match:{DB_SERVICE_PORTS[port]}",
            "confidence": "high",
        }

    # ── Priority 2: Mail server ───────────────────────────────────
    if first_label in MAIL_SUBDOMAIN_PATTERNS or port in MAIL_PORTS:
        return {
            "primary_type": "mail_server",
            "secondary_types": ["ssl_certificate"] if tls_supported else [],
            "detection_method": "subdomain_or_port",
            "confidence": "high" if port in MAIL_PORTS else "medium",
        }

    # ── Priority 3: DNS server ────────────────────────────────────
    if first_label in DNS_SUBDOMAIN_PATTERNS or port in DNS_PORTS:
        return {
            "primary_type": "dns_server",
            "secondary_types": [],
            "detection_method": "subdomain_or_port",
            "confidence": "high" if port in DNS_PORTS else "medium",
        }

    # ── Priority 4: API ──────────────────────────────────────────
    if api_details.get("is_api"):
        secondary = []
        if tls_supported:
            secondary.append("ssl_certificate")
        if infra_details.get("cdn_provider"):
            secondary.append("cdn_proxy")
        return {
            "primary_type": "api",
            "secondary_types": secondary,
            "detection_method": "api_detection",
            "confidence": "high" if len(api_details.get("indicators", [])) >= 2 else "medium",
        }

    # ── Priority 5: CDN / Proxy / WAF ────────────────────────────
    if infra_details.get("cdn_provider") or infra_details.get("waf_detected"):
        secondary = ["ssl_certificate"] if tls_supported else []
        ptype = "cdn_proxy"
        if infra_details.get("load_balanced"):
            secondary.append("load_balancer")
        return {
            "primary_type": ptype,
            "secondary_types": secondary,
            "detection_method": "infrastructure_headers",
            "confidence": "high",
        }

    # ── Priority 6: Web application / web server ─────────────────
    if http_status and port in (80, 443, 8080, 8443):
        page_title = http_fp.get("page_title")
        tech_hints = http_fp.get("technology_hints", [])

        # Distinguish web_application from web_server
        is_web_app = (
            ("text/html" in content_type and page_title)
            or any(cms in str(tech_hints).lower()
                   for cms in ("wordpress", "drupal", "joomla", "shopify", "magento", "next.js"))
        )

        # Default IIS / Apache / Nginx pages aren't "web applications"
        is_default_page = page_title and any(
            kw in (page_title or "").lower()
            for kw in ("welcome to nginx", "apache2 ", "iis windows server", "test page",
                       "it works", "default web site", "default page")
        )

        secondary = ["ssl_certificate"] if tls_supported else []
        if infra_details.get("reverse_proxy"):
            secondary.append("reverse_proxy")

        if is_web_app and not is_default_page:
            return {
                "primary_type": "web_application",
                "secondary_types": secondary,
                "detection_method": "http_content_analysis",
                "confidence": "high",
            }
        else:
            return {
                "primary_type": "web_server",
                "secondary_types": secondary,
                "detection_method": "http_server_response",
                "confidence": "medium",
            }

    # ── Priority 7: SSL certificate (TLS present, no HTTP) ───────
    if tls_supported:
        return {
            "primary_type": "ssl_certificate",
            "secondary_types": [],
            "detection_method": "tls_handshake",
            "confidence": "medium",
        }

    # ── Priority 8: IP address (raw, no service) ─────────────────
    if is_ip_address(host):
        return {
            "primary_type": "ip_address",
            "secondary_types": [],
            "detection_method": "raw_ip",
            "confidence": "low",
        }

    # ── Priority 9: Domain (no service detected) ─────────────────
    return {
        "primary_type": "domain",
        "secondary_types": [],
        "detection_method": "default_classification",
        "confidence": "low",
    }


# ── Sanitize sensitive data ─────────────────────────────────────
_SENSITIVE_HEADERS = {
    "set-cookie", "authorization", "proxy-authorization",
    "www-authenticate", "proxy-authenticate", "cookie",
}


def _sanitize_headers(headers: dict) -> dict:
    """Remove security-sensitive headers from the stored response headers."""
    return {
        k: v for k, v in headers.items()
        if k.lower() not in _SENSITIVE_HEADERS
    }


def _sanitize_body_snippet(body: str | None, max_len: int = 512) -> str:
    """Truncate and HTML-escape the body snippet to prevent XSS."""
    if not body:
        return ""
    truncated = body[:max_len]
    return html.escape(truncated)


# -----------------------------
# Generic helpers
# -----------------------------
def normalize_host(host: str) -> str:
    return host.strip().lower().rstrip(".")


def is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except Exception:
        return False


def unique_preserve_order(items: list[str]) -> list[str]:
    seen = set()
    out: list[str] = []
    for item in items:
        key = normalize_host(item)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def write_json_file(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def resolve_host(host: str, timeout: float = 5.0) -> str | None:
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
        return infos[0][4][0] if infos else None
    except Exception:
        return None


def safe_get_text(url: str, timeout: float = 5.0, https_context: ssl.SSLContext | None = None) -> tuple[int | None, dict, str]:
    headers = {"User-Agent": "QRIE-Scanner/3.0 (Crypto-Asset-Discovery)"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=https_context) as res:
            status = getattr(res, "status", None)
            hdrs = dict(res.getheaders())
            body_bytes = res.read(4096)
            body = body_bytes.decode("utf-8", errors="ignore")
            return status, hdrs, body
    except urllib.error.HTTPError as e:
        try:
            hdrs = dict(e.headers.items()) if e.headers else {}
        except Exception:
            hdrs = {}
        body = ""
        try:
            body = e.read(4096).decode("utf-8", errors="ignore")
        except Exception:
            pass
        return e.code, hdrs, body
    except Exception:
        return None, {}, ""


# -----------------------------
# crt.sh enumeration
# -----------------------------
def enumerate_from_crtsh(domain: str) -> set[str]:
    domain = normalize_host(domain)
    if is_ip_address(domain):
        return set()

    url = f"https://crt.sh/?q=%25.{domain}&output=json"
    subdomains: set[str] = set()

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200:
                return set()

            payload = response.read().decode("utf-8", errors="ignore")
            data = json.loads(payload)

            for entry in data:
                name_value = entry.get("name_value", "")
                for raw_name in name_value.split("\n"):
                    name = normalize_host(raw_name)
                    if not name or name.startswith("*."):
                        continue
                    if name == domain or name.endswith("." + domain):
                        if re.fullmatch(r"[a-z0-9.-]+", name):
                            subdomains.add(name)
    except Exception:
        pass

    return subdomains


# -----------------------------
# TLS probing
# -----------------------------
def probe_single_tls_version(host: str, port: int, tls_ver: str, timeout: float) -> tuple[bool, dict]:
    bounds = TLS_VERSION_CONSTS.get(tls_ver)
    if bounds is None:
        return False, {}

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        ctx.minimum_version = bounds[0]
        ctx.maximum_version = bounds[1]
    except Exception:
        return False, {}

    try:
        with socket.create_connection((host, port), timeout=timeout) as raw:
            t0 = time.monotonic()
            with ctx.wrap_socket(raw, server_hostname=host) as tls_sock:
                latency_ms = round((time.monotonic() - t0) * 1000, 1)
                cipher_tuple = tls_sock.cipher()
                negotiated = tls_sock.version()
                der_cert = tls_sock.getpeercert(binary_form=True)
                return True, {
                    "negotiated_version": negotiated,
                    "cipher_tuple": cipher_tuple,
                    "latency_ms": latency_ms,
                    "der_cert": der_cert,
                }
    except Exception:
        return False, {}


def parse_cipher(cipher_tuple: tuple | None) -> dict:
    if not cipher_tuple:
        return {
            "cipher_suite": None,
            "key_exchange": None,
            "authentication": None,
            "encryption": None,
            "hash_algo": None,
            "pfs": "Unknown",
        }

    name = cipher_tuple[0]

    # TLS 1.3 cipher suites use underscore format (e.g. TLS_AES_128_GCM_SHA256).
    # The KEX is not encoded in the name; TLS 1.3 mandates ECDHE for every
    # handshake, so PFS is always guaranteed — never parse these with TLS 1.2 logic.
    if name.startswith("TLS_"):
        return {
            "cipher_suite": name,
            "key_exchange": "ECDHE",   # TLS 1.3 always uses ephemeral key exchange
            "authentication": None,
            "encryption": None,
            "hash_algo": None,
            "pfs": "Yes",
        }

    # TLS 1.2 and earlier: parse KEX from dash-delimited cipher name
    parts = name.split("-")

    kex = parts[0] if parts else None
    auth = parts[1] if len(parts) > 1 else None
    enc = "-".join(parts[2:-1]) if len(parts) > 3 else (parts[2] if len(parts) > 2 else None)
    mac = parts[-1] if parts else None

    pfs = "Yes" if kex in PFS_KEX else ("No" if kex else "Unknown")

    return {
        "cipher_suite": name,
        "key_exchange": kex,
        "authentication": auth,
        "encryption": enc,
        "hash_algo": mac,
        "pfs": pfs,
    }


# -----------------------------
# Certificate extraction
# -----------------------------
def extract_cert_info(der_cert: bytes | None) -> dict:
    if not der_cert:
        return {
            "public_key_algo": None,
            "key_size_bits": None,
            "signature_algo": None,
            "issuer_ca": None,
            "not_before": None,
            "not_after": None,
            "oid_reference": None,
            "subject_cn": None,
        }

    try:
        from cryptography import x509
        from cryptography.hazmat.primitives.asymmetric import dsa, ec, ed25519, ed448, rsa

        cert = x509.load_der_x509_certificate(der_cert)
        pub_key = cert.public_key()
        sig_algo = cert.signature_algorithm_oid.dotted_string

        if isinstance(pub_key, rsa.RSAPublicKey):
            pk_algo = "RSA"
            key_bits = pub_key.key_size
        elif isinstance(pub_key, ec.EllipticCurvePublicKey):
            pk_algo = "EC"
            key_bits = pub_key.key_size
        elif isinstance(pub_key, dsa.DSAPublicKey):
            pk_algo = "DSA"
            key_bits = pub_key.key_size
        elif isinstance(pub_key, (ed25519.Ed25519PublicKey, ed448.Ed448PublicKey)):
            pk_algo = type(pub_key).__name__.replace("PublicKey", "")
            key_bits = 256 if "25519" in pk_algo else 448
        else:
            pk_algo = type(pub_key).__name__
            key_bits = None

        try:
            sig_name = cert.signature_hash_algorithm.name + "With" + pk_algo
        except Exception:
            sig_name = sig_algo

        try:
            cn = cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
            subject_cn = cn[0].value if cn else None
        except Exception:
            subject_cn = None

        try:
            issuer_cn = cert.issuer.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
            issuer_ca = f"CN={issuer_cn[0].value}" if issuer_cn else str(cert.issuer)
        except Exception:
            issuer_ca = str(cert.issuer)

        try:
            not_before = cert.not_valid_before_utc.isoformat()
            not_after = cert.not_valid_after_utc.isoformat()
        except Exception:
            not_before = None
            not_after = None

        return {
            "public_key_algo": pk_algo,
            "key_size_bits": key_bits,
            "signature_algo": sig_name,
            "issuer_ca": issuer_ca,
            "not_before": not_before,
            "not_after": not_after,
            "oid_reference": sig_algo,
            "subject_cn": subject_cn,
        }
    except ImportError:
        return {
            "public_key_algo": "RSA",
            "key_size_bits": None,
            "signature_algo": None,
            "issuer_ca": None,
            "not_before": None,
            "not_after": None,
            "oid_reference": None,
            "subject_cn": None,
        }
    except Exception:
        return {
            "public_key_algo": None,
            "key_size_bits": None,
            "signature_algo": None,
            "issuer_ca": None,
            "not_before": None,
            "not_after": None,
            "oid_reference": None,
            "subject_cn": None,
        }


# -----------------------------
# HTTP / service fingerprinting
# -----------------------------
def extract_software_hints(headers: dict[str, str], body: str) -> dict:
    normalized_headers = {str(k).lower(): str(v) for k, v in headers.items()}
    header_blob = " ".join(f"{k}: {v}" for k, v in normalized_headers.items()).lower()
    body_blob = (body or "").lower()

    server = normalized_headers.get("server")
    powered_by = normalized_headers.get("x-powered-by")
    technology_hints: list[str] = []
    software_versions: list[str] = []

    def add_hint(label: str) -> None:
        if label not in technology_hints:
            technology_hints.append(label)

    def add_version(text: str) -> None:
        if text not in software_versions:
            software_versions.append(text)

    if server:
        add_hint(server)

        m = re.search(r"([a-zA-Z0-9._+-]+)[ /]?([0-9][a-zA-Z0-9._+-]*)?", server)
        if m and m.group(1):
            vendor = m.group(1)
            version = m.group(2)
            if version:
                add_version(f"{vendor}/{version}")
            else:
                add_version(vendor)

    if powered_by:
        add_hint(powered_by)
        m = re.search(r"([A-Za-z0-9._+-]+)[ /]?([0-9][A-Za-z0-9._+-]*)?", powered_by)
        if m and m.group(1):
            if m.group(2):
                add_version(f"{m.group(1)}/{m.group(2)}")
            else:
                add_version(m.group(1))

    for needle, label in TECH_HINTS.items():
        if needle in header_blob or needle in body_blob:
            add_hint(label)

    for needle, label in CMS_HINTS.items():
        if needle in header_blob or needle in body_blob:
            add_hint(label)

    for key, value in normalized_headers.items():
        if key in {"x-aspnet-version", "x-aspnetmvc-version", "x-generator", "x-runtime", "x-drupal-cache"}:
            add_hint(f"{key}: {value}")
            if value:
                add_version(f"{key}: {value}")

    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
    page_title = title_match.group(1).strip() if title_match else None

    return {
        "page_title": page_title,
        "server_header": server,
        "x_powered_by": powered_by,
        "technology_hints": technology_hints,
        "software_versions": software_versions,
    }


def infer_os(server_header: str | None, powered_by: str | None, headers: dict[str, str], body: str) -> dict:
    blobs = " ".join(
        [
            server_header or "",
            powered_by or "",
            " ".join(f"{k}: {v}" for k, v in headers.items()),
            body[:2048],
        ]
    ).lower()

    inferred = "Unknown"
    confidence = "low"

    for needle, label in OS_HINTS.items():
        if needle in blobs:
            inferred = label
            confidence = "medium"
            break

    if inferred == "Unknown":
        if any(x in blobs for x in ["nginx", "apache", "openresty", "caddy", "gunicorn", "uvicorn", "wsgi", "uwsgi"]):
            inferred = "Linux / Unix likely"
            confidence = "low"

    version_hints: list[str] = []
    for pat in [
        r"\bubuntu\s+([0-9][0-9.]+)\b",
        r"\bdebian\s+([0-9][0-9.]+)\b",
        r"\bcentos\s+([0-9][0-9.]+)\b",
        r"\bred hat\s+([0-9][0-9.]+)\b",
        r"\balpine\s+([0-9][0-9.]+)\b",
        r"\bwindows\s+([0-9a-zA-Z ._-]+)\b",
        r"\bmacos\s+([0-9a-zA-Z ._-]+)\b",
    ]:
        for match in re.findall(pat, blobs, flags=re.IGNORECASE):
            if isinstance(match, tuple):
                value = " ".join(match).strip()
            else:
                value = str(match).strip()
            if value and value not in version_hints:
                version_hints.append(value)

    return {
        "os_guess": inferred,
        "confidence": confidence,
        "version_hints": version_hints,
    }


def fingerprint_http(host: str, port: int, timeout: float = 5.0, tls_supported: bool = False) -> dict:
    host = normalize_host(host)

    candidates: list[tuple[str, bool]] = []
    if port == 443 or tls_supported:
        candidates.append((f"https://{host}:{port}", True))
    candidates.append((f"http://{host}:{port}", False))

    for url, is_https in candidates:
        ctx = None
        if is_https:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

        status, headers, body = safe_get_text(url, timeout=timeout, https_context=ctx)
        if status is None and not headers and not body:
            continue

        hints = extract_software_hints(headers, body)
        os_info = infer_os(
            hints.get("server_header"),
            hints.get("x_powered_by"),
            headers,
            body,
        )

        return {
            "scheme": urlparse(url).scheme,
            "url": url,
            "status": status,
            "headers": headers,
            "page_title": hints.get("page_title"),
            "server_header": hints.get("server_header"),
            "x_powered_by": hints.get("x_powered_by"),
            "technology_hints": hints.get("technology_hints", []),
            "software_versions": hints.get("software_versions", []),
            "os_guess": os_info.get("os_guess"),
            "os_confidence": os_info.get("confidence"),
            "os_version_hints": os_info.get("version_hints", []),
            "body_snippet": body[:512] if body else "",
        }

    return {
        "scheme": None,
        "url": None,
        "status": None,
        "headers": {},
        "page_title": None,
        "server_header": None,
        "x_powered_by": None,
        "technology_hints": [],
        "software_versions": [],
        "os_guess": "Unknown",
        "os_confidence": "low",
        "os_version_hints": [],
        "body_snippet": "",
    }


# -----------------------------
# Risk labels
# -----------------------------
def pqc_label(key_algo: str | None, key_bits: int | None, cipher: str | None) -> str:
    if not key_algo:
        return "Unknown"
    algo = key_algo.upper()
    if algo in ("CRYSTALS-KYBER", "CRYSTALS-DILITHIUM", "SPHINCS+", "FALCON"):
        return "PQC-Ready"
    if algo == "RSA":
        if key_bits and key_bits >= 4096:
            return "Migration-Candidate"
        return "Quantum-Vulnerable"
    if algo in ("ECDSA", "EC"):
        return "Quantum-Vulnerable"
    return "Unknown"


def is_valid_crypto_record(record: dict) -> bool:
    return (
        record.get("TLS Supported") is True
        and record.get("Scan Status") == "ok"
        and record.get("Cipher Suite") is not None
    )


def is_shadow_crypto_record(record: dict) -> bool:
    if not is_valid_crypto_record(record):
        return False

    tls_version = str(record.get("TLS Version") or "")
    cipher = str(record.get("Cipher Suite") or "").upper()
    pfs = str(record.get("PFS Status") or "Unknown")
    key_bits = record.get("Key Size (Bits)")

    if tls_version in {"TLSv1.0", "TLSv1.1"}:
        return True
    if pfs != "Yes":
        return True
    if any(marker in cipher for marker in WEAK_CIPHER_MARKERS):
        return True
    if isinstance(key_bits, int) and key_bits and key_bits < 2048:
        return True

    return False


def build_cbom_record(
    host: str,
    port: int,
    ip: str | None,
    probe_results: dict[str, tuple[bool, dict]],
    tls_timeout: float = 6.0,
) -> dict:
    supported_versions = [v for v in TLS_PROBE_ORDER if probe_results.get(v, (False,))[0]]
    tls_supported = len(supported_versions) > 0

    http_fp = fingerprint_http(host, port, timeout=tls_timeout, tls_supported=tls_supported)

    # ── Gather raw info for classification ────────────────────────
    raw_headers = http_fp.get("headers", {})
    raw_body = http_fp.get("body_snippet", "")
    http_status = http_fp.get("status")

    # API indicator detection
    api_details = detect_api_indicators(host, port, raw_headers, raw_body, http_status)

    # Infrastructure detection (CDN, WAF, proxy, LB)
    infra_details = detect_infrastructure(raw_headers, raw_body, http_fp.get("server_header"))

    # Network service info
    network_details = classify_network_service(ip, port)

    # Sanitize outputs for security
    sanitized_headers = _sanitize_headers(raw_headers)
    sanitized_body = _sanitize_body_snippet(raw_body)

    if not tls_supported:
        cert_info_basic: dict = {
            "public_key_algo": None, "key_size_bits": None, "signature_algo": None,
            "issuer_ca": None, "not_before": None, "not_after": None,
            "oid_reference": None, "subject_cn": None,
        }

        # SSL details (empty for no TLS)
        ssl_details = extract_ssl_details(None, None, None, cert_info_basic)

        # Asset type classification
        asset_type_info = classify_asset_type(
            host, port, ip, False, http_fp, api_details, infra_details, cert_info_basic,
        )

        return {
            "Asset ID": _deterministic_asset_id(host, port),
            "Asset": host,
            "IP Address": ip,
            "Port": port,
            "Asset Type": asset_type_info["primary_type"],
            "Asset Type Details": asset_type_info,
            "TLS Supported": False,
            "Supported TLS Versions": [],
            "Minimum Supported TLS": None,
            "Maximum Supported TLS": None,
            "TLS Version": None,
            "Cipher Suite": None,
            "Key Exchange Algorithm": None,
            "Authentication Algorithm": None,
            "Encryption Algorithm": None,
            "Hash Algorithm": None,
            "Handshake Latency": None,
            "Public Key Algorithm": None,
            "Key Size (Bits)": None,
            "PFS Status": "Unknown",
            "OID Reference": None,
            "NIST PQC Readiness Label": "Unknown",
            "Scan Status": "error",
            "Error": "No TLS version successfully negotiated",
            "Certificate Validity (Not Before/After)": {"Not Before": None, "Not After": None},
            "Signature Algorithm": None,
            "Issuer CA": None,
            "Subject CN": None,
            "SSL Details": ssl_details,
            "API Details": api_details,
            "Network Details": network_details,
            "Infrastructure": infra_details,
            "HTTP Scheme": http_fp.get("scheme"),
            "HTTP URL": http_fp.get("url"),
            "HTTP Status": http_status,
            "Web Server": http_fp.get("server_header"),
            "X-Powered-By": http_fp.get("x_powered_by"),
            "Technology Hints": http_fp.get("technology_hints", []),
            "Software Versions": http_fp.get("software_versions", []),
            "Detected OS": http_fp.get("os_guess"),
            "OS Confidence": http_fp.get("os_confidence"),
            "OS Version Hints": http_fp.get("os_version_hints", []),
            "Response Headers": sanitized_headers,
            "Page Title": http_fp.get("page_title"),
            "Body Snippet": sanitized_body,
        }

    best_ver = supported_versions[-1]
    _, best_md = probe_results[best_ver]

    cipher_info = parse_cipher(best_md.get("cipher_tuple"))
    cert_info = extract_cert_info(best_md.get("der_cert"))

    pk_algo = cert_info["public_key_algo"]
    key_bits = cert_info["key_size_bits"]

    # SSL detail extraction from DER cert
    ssl_details = extract_ssl_details(
        best_md.get("der_cert"),
        best_ver,
        cipher_info["cipher_suite"],
        cert_info,
    )

    # Asset type classification
    asset_type_info = classify_asset_type(
        host, port, ip, True, http_fp, api_details, infra_details, cert_info,
    )

    return {
        "Asset ID": _deterministic_asset_id(host, port),
        "Asset": host,
        "IP Address": ip or "—",
        "Port": port,
        "Asset Type": asset_type_info["primary_type"],
        "Asset Type Details": asset_type_info,
        "TLS Supported": True,
        "Supported TLS Versions": supported_versions,
        "Minimum Supported TLS": supported_versions[0],
        "Maximum Supported TLS": supported_versions[-1],
        "TLS Version": best_ver,
        "Cipher Suite": cipher_info["cipher_suite"],
        "Key Exchange Algorithm": cipher_info["key_exchange"],
        "Authentication Algorithm": cipher_info["authentication"],
        "Encryption Algorithm": cipher_info["encryption"],
        "Hash Algorithm": cipher_info["hash_algo"],
        "Handshake Latency": best_md.get("latency_ms"),
        "Public Key Algorithm": pk_algo,
        "Key Size (Bits)": key_bits,
        "PFS Status": cipher_info["pfs"],
        "OID Reference": cert_info["oid_reference"],
        "NIST PQC Readiness Label": pqc_label(pk_algo, key_bits, cipher_info["cipher_suite"]),
        "Scan Status": "ok",
        "Error": None,
        "Certificate Validity (Not Before/After)": {
            "Not Before": cert_info["not_before"],
            "Not After": cert_info["not_after"],
        },
        "Signature Algorithm": cert_info["signature_algo"],
        "Issuer CA": cert_info["issuer_ca"],
        "Subject CN": cert_info["subject_cn"],
        "SSL Details": ssl_details,
        "API Details": api_details,
        "Network Details": network_details,
        "Infrastructure": infra_details,
        "HTTP Scheme": http_fp.get("scheme"),
        "HTTP URL": http_fp.get("url"),
        "HTTP Status": http_status,
        "Web Server": http_fp.get("server_header"),
        "X-Powered-By": http_fp.get("x_powered_by"),
        "Technology Hints": http_fp.get("technology_hints", []),
        "Software Versions": http_fp.get("software_versions", []),
        "Detected OS": http_fp.get("os_guess"),
        "OS Confidence": http_fp.get("os_confidence"),
        "OS Version Hints": http_fp.get("os_version_hints", []),
        "Response Headers": sanitized_headers,
        "Page Title": http_fp.get("page_title"),
        "Body Snippet": sanitized_body,
    }


def build_shadow_crypto_record(record: dict) -> dict:
    cipher = str(record.get("Cipher Suite") or "")
    reasons: list[str] = []

    tls_version = str(record.get("TLS Version") or "")
    if tls_version in {"TLSv1.0", "TLSv1.1"}:
        reasons.append(f"Deprecated TLS version: {tls_version}")

    pfs = str(record.get("PFS Status") or "Unknown")
    if pfs != "Yes":
        reasons.append(f"PFS status: {pfs}")

    cipher_upper = cipher.upper()
    for marker in WEAK_CIPHER_MARKERS:
        if marker in cipher_upper:
            reasons.append(f"Weak cipher marker: {marker}")
            break

    key_bits = record.get("Key Size (Bits)")
    if isinstance(key_bits, int) and key_bits and key_bits < 2048:
        reasons.append(f"Small key size: {key_bits}")

    return {
        **record,
        "Shadow Crypto Reasons": reasons,
        "Shadow Crypto Severity": (
            "high" if tls_version in {"TLSv1.0", "TLSv1.1"} or any(m in cipher_upper for m in {"NULL", "RC4", "DES", "3DES"})
            else "medium"
        ),
    }



# ═══════════════════════════════════════════════════════════════
# PQC Enrichment Engine
# (ported from pqc_enrichment.py — runs inline after each scan)
# ═══════════════════════════════════════════════════════════════

import datetime as _dt

# ── Field aliases ────────────────────────────────────────────────
_PQC_FIELD: dict[str, tuple] = {
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

def _pqc_get(obj: dict, field_key: str, default=None):
    for alias in _PQC_FIELD.get(field_key, ()):
        if alias in obj:
            return obj[alias]
    return default

def _pqc_str(obj: dict, field_key: str) -> str:
    v = _pqc_get(obj, field_key, "")
    return str(v).strip() if v is not None else ""


# ── Error classification ─────────────────────────────────────────
_PQC_ERROR_PATTERNS = [
    ("TLS_NEGOTIATION_FAILURE", [
        "no tls version successfully negotiated", "sslv3_alert_handshake_failure",
        "ssl/tls alert handshake failure", "handshake failure", "no protocols available",
        "no shared cipher", "ssl: unsupported protocol", "eof occurred in violation of protocol",
        "wrong version number", "unknown protocol", "sslv3 alert unexpected message",
        "record layer failure", "bad handshake message",
    ]),
    ("HOST_UNREACHABLE", [
        "connection refused", "no route to host", "network unreachable",
        "name or service not known", "nodename nor servname", "getaddrinfo failed",
        "nxdomain", "name resolution failed", "errno 111", "errno 113", "errno 101",
        "[errno 111]", "[errno 113]", "[errno 101]", "connection reset by peer",
        "host not found", "temporary failure in name resolution",
    ]),
    ("CERTIFICATE_ISSUE", [
        "certificate has expired", "certificate verify failed", "certificate_expired",
        "certificate_unknown", "self.signed certificate", "self signed certificate",
        "cert mismatch", "hostname mismatch", "unable to get local issuer certificate",
        "certificate chain error",
    ]),
    ("TIMEOUT", [
        "timed out", "timeout", "connection timed", "read timeout", "etimedout", "[errno 110]",
    ]),
]

_PQC_ERROR_SCORE_DEFAULTS = {
    "TLS_NEGOTIATION_FAILURE": {"tls_score": 1.0, "kex_score": 1.0, "cipher_score": 1.0,
                                "pfs_present": False, "pfs_penalty": 15, "pqc_penalty": 20},
    "HOST_UNREACHABLE": None,
    "CERTIFICATE_ISSUE": {"tls_score": 0.5, "kex_score": 1.0, "cipher_score": 0.5,
                          "pfs_present": True, "pfs_penalty": 0, "pqc_penalty": 20},
    "TIMEOUT": {"tls_score": 1.0, "kex_score": 1.0, "cipher_score": 0.75,
                "pfs_present": False, "pfs_penalty": 15, "pqc_penalty": 20},
    "UNKNOWN_ERROR": {"tls_score": 1.0, "kex_score": 1.0, "cipher_score": 0.75,
                      "pfs_present": False, "pfs_penalty": 15, "pqc_penalty": 20},
}

def _pqc_classify_error(error_msg: str) -> str:
    if not error_msg:
        return "UNKNOWN_ERROR"
    low = error_msg.lower()
    for class_name, patterns in _PQC_ERROR_PATTERNS:
        if any(p in low for p in patterns):
            return class_name
    return "UNKNOWN_ERROR"


# ── TLS version parsing ──────────────────────────────────────────
def _pqc_parse_tls(raw: str) -> float:
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

def _pqc_supported_probe_versions(probes) -> list:
    if not isinstance(probes, list):
        return []
    result = []
    for p in probes:
        if not isinstance(p, dict):
            continue
        if str(p.get("supported", False)).lower() in ("true", "1", "yes"):
            v = _pqc_parse_tls(str(p.get("tls_version") or ""))
            if v > 0:
                result.append((v, p))
    return sorted(result, key=lambda x: x[0])

def _pqc_effective_tls(asset: dict) -> float:
    for fk in ("tls_version", "min_tls"):
        ver = _pqc_parse_tls(_pqc_str(asset, fk))
        if ver > 0:
            return ver
    sv = _pqc_get(asset, "supported_versions")
    if isinstance(sv, list):
        versions = [_pqc_parse_tls(str(x)) for x in sv if _pqc_parse_tls(str(x)) > 0]
        if versions:
            return max(versions)
    supported = _pqc_supported_probe_versions(_pqc_get(asset, "tls_probe"))
    if supported:
        return supported[-1][0]
    return -1.0

def _pqc_worst_tls(asset: dict, shadow_findings: list = None) -> float:
    shadow_worst = None
    if shadow_findings:
        for finding in shadow_findings:
            if finding.get("finding_type") == "weak_tls":
                weak = finding.get("details", {}).get("weak_versions", [])
                parsed = [_pqc_parse_tls(v) for v in weak if _pqc_parse_tls(v) > 0]
                if parsed:
                    shadow_worst = min(parsed)
                    break
    cbom_worst = None
    min_ver = _pqc_parse_tls(_pqc_str(asset, "min_tls"))
    if min_ver > 0:
        cbom_worst = min_ver
    else:
        sv = _pqc_get(asset, "supported_versions")
        if isinstance(sv, list):
            versions = [_pqc_parse_tls(str(x)) for x in sv if _pqc_parse_tls(str(x)) > 0]
            if versions:
                cbom_worst = min(versions)
        if cbom_worst is None:
            supported = _pqc_supported_probe_versions(_pqc_get(asset, "tls_probe"))
            if supported:
                cbom_worst = supported[0][0]
    candidates = [v for v in (shadow_worst, cbom_worst) if v is not None]
    if candidates:
        return min(candidates)
    return _pqc_effective_tls(asset)

def _pqc_extract_from_best_probe(asset: dict) -> dict:
    supported = _pqc_supported_probe_versions(_pqc_get(asset, "tls_probe"))
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

def _pqc_has_any_tls_data(asset: dict) -> bool:
    return (
        _pqc_effective_tls(asset) > 0
        or bool(_pqc_str(asset, "cipher_suite"))
        or bool(_pqc_str(asset, "kex_algo"))
        or bool(_pqc_supported_probe_versions(_pqc_get(asset, "tls_probe")))
    )


# ── PQC / hybrid detection ───────────────────────────────────────
_PQC_KEM_SIGNALS = {
    "KYBER", "ML-KEM", "MLKEM", "CRYSTALS", "FRODO", "NTRU",
    "SABER", "HQC", "BIKE", "MCELIECE", "CLASSIC-MCELIECE", "XWING",
}
_PQC_HYBRID_SIGNALS = {
    "HYBRID", "X25519KYBER", "P256KYBER", "P384KYBER",
    "X25519MLKEM", "P256MLKEM", "P384MLKEM",
}

def _pqc_detect_pqc(asset: dict) -> tuple:
    combined = " ".join(filter(None, [
        _pqc_str(asset, "kex_algo"), _pqc_str(asset, "nist_label"),
        _pqc_str(asset, "cipher_suite"), _pqc_str(asset, "enc_algo"),
    ])).upper()
    uses_pqc    = any(k in combined for k in _PQC_KEM_SIGNALS)
    uses_hybrid = any(k in combined for k in _PQC_HYBRID_SIGNALS)
    return uses_pqc, uses_hybrid


# ── HEI scoring ──────────────────────────────────────────────────
def _pqc_compute_hei(asset: dict, shadow_findings: list = None, error_defaults: dict = None) -> tuple:
    tls_for_risk = _pqc_worst_tls(asset, shadow_findings)
    tls_for_qrmm = _pqc_effective_tls(asset)
    ed = error_defaults or {}

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

    uses_pqc, uses_hybrid = _pqc_detect_pqc(asset)
    if uses_pqc:
        kex_score = 0.0
    elif uses_hybrid:
        kex_score = 0.5
    else:
        kex_score = ed.get("kex_score", 1.0)

    combined_c = (_pqc_str(asset, "enc_algo") + " " + _pqc_str(asset, "cipher_suite")).upper()
    if "256" in combined_c or "CHACHA20" in combined_c:
        cipher_score = 0.5
    elif "128" in combined_c or "3DES" in combined_c or "RC4" in combined_c:
        cipher_score = 1.0
    elif combined_c.strip():
        cipher_score = 0.75
    else:
        cipher_score = ed.get("cipher_score", 0.75)

    pfs_raw     = _pqc_str(asset, "pfs_status").upper()
    pfs_present = pfs_raw in ("YES", "TRUE", "ENABLED", "1", "PRESENT")
    kex_raw     = _pqc_str(asset, "kex_algo").upper()
    if "ECDHE" in kex_raw or "DHE" in kex_raw:
        pfs_present = True
    if not pfs_present and not pfs_raw and not kex_raw:
        pfs_present = ed.get("pfs_present", False)
    pfs_penalty = 0 if pfs_present else ed.get("pfs_penalty", 15)

    pqc_any     = uses_pqc or uses_hybrid or bool(_pqc_str(asset, "nist_label"))
    pqc_penalty = 0 if pqc_any else ed.get("pqc_penalty", 20)

    shadow_hei_bonus = 0
    shadow_flags     = []
    if shadow_findings:
        for f in shadow_findings:
            ft = f.get("finding_type", "")
            if ft == "self_signed_cert" and "self_signed" not in shadow_flags:
                shadow_hei_bonus += 10
                shadow_flags.append("self_signed")
            elif ft == "cert_mismatch" and "cert_mismatch" not in shadow_flags:
                shadow_hei_bonus += 5
                shadow_flags.append("cert_mismatch")

    cert_expiry_penalty = 0
    validity        = asset.get("Certificate Validity (Not Before/After)") or {}
    not_after_str   = str(validity.get("Not After") or validity.get("not_after") or "")
    if not_after_str:
        try:
            clean     = re.sub(r"[+-]\d{2}:\d{2}$", "", not_after_str.replace("Z", ""))
            not_after = _dt.datetime.fromisoformat(clean)
            days_left = (not_after - _dt.datetime.now()).days
            if days_left < 0:
                cert_expiry_penalty = 10
            elif days_left < 30:
                cert_expiry_penalty = 7
            elif days_left < 90:
                cert_expiry_penalty = 3
        except (ValueError, TypeError):
            pass

    oid_penalty = 0
    oid         = str(asset.get("OID Reference") or "")
    _WEAK_OIDS  = {"1.2.840.113549.1.1.5", "1.2.840.113549.1.1.4", "1.2.840.10040.4.3"}
    if any(w in oid for w in _WEAK_OIDS):
        oid_penalty = 5

    hei = min(round(
        20 * tls_score + 25 * kex_score + 20 * cipher_score +
        pfs_penalty + pqc_penalty +
        shadow_hei_bonus + cert_expiry_penalty + oid_penalty,
        2), 100.0)

    return hei, {
        "tls_version_for_risk": tls_for_risk,
        "tls_version_for_qrmm": tls_for_qrmm,
        "tls_score":            tls_score,
        "kex_score":            kex_score,
        "uses_pqc_kem":         uses_pqc,
        "uses_hybrid":          uses_hybrid,
        "cipher_score":         cipher_score,
        "pfs_present":          pfs_present,
        "pfs_penalty":          pfs_penalty,
        "pqc_any":              pqc_any,
        "pqc_penalty":          pqc_penalty,
        "shadow_hei_bonus":     shadow_hei_bonus,
        "shadow_flags":         shadow_flags,
        "cert_expiry_penalty":  cert_expiry_penalty,
        "oid_penalty":          oid_penalty,
        "used_error_defaults":  bool(ed),
    }


# ── Risk category ────────────────────────────────────────────────
def _pqc_risk_category(hei: float) -> str:
    if hei <= 25: return "Low"
    if hei <= 50: return "Moderate"
    if hei <= 75: return "High"
    return "Critical"


# ── MDS scoring ──────────────────────────────────────────────────
_PQC_LARGE_CA_ORGS = {
    "DIGICERT", "LETS ENCRYPT", "AMAZON", "MICROSOFT", "GOOGLE",
    "CLOUDFLARE", "COMODO", "SECTIGO", "ENTRUST", "GLOBALSIGN",
    "QUOVADIS", "GODADDY", "IDENTRUST", "VERISIGN", "THAWTE",
    "GEOTRUST", "ACTALIS", "BUYPASS", "TRUSTWAVE",
}

def _pqc_compute_mds(asset: dict, tls_ver: float,
                     shadow_findings: list = None,
                     error_class: str = None) -> tuple:
    if tls_ver < 0:
        legacy = 100 if error_class == "TLS_NEGOTIATION_FAILURE" else 75
    elif tls_ver <= 1.1: legacy = 90
    elif tls_ver < 1.3:  legacy = 50
    else:                legacy = 10

    key_size = 0
    raw_ks   = _pqc_get(asset, "key_size")
    try:
        key_size = int(str(raw_ks).replace(",", "").strip()) if raw_ks else 0
    except (ValueError, TypeError):
        key_size = 0
    nist = _pqc_str(asset, "nist_label")
    if nist:               hardware = 25
    elif key_size >= 4096: hardware = 40
    elif key_size >= 2048: hardware = 55
    elif key_size > 0:     hardware = 75
    else:                  hardware = 65

    sig    = _pqc_str(asset, "sig_algo").upper()
    issuer = _pqc_str(asset, "issuer_ca")
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
                cert += 25
                break
    if shadow_findings:
        for f in shadow_findings:
            if f.get("finding_type") == "cert_mismatch":
                cert += 15
                break
    if error_class == "CERTIFICATE_ISSUE":
        cert = min(cert + 20, 100)
    cert = max(0, min(100, cert))

    issuer_up = issuer.upper()
    asset_up  = _pqc_str(asset, "asset_name").upper()
    vendor = 30 if any(org in issuer_up or org in asset_up for org in _PQC_LARGE_CA_ORGS) else 65

    mds = min(round(0.30 * legacy + 0.20 * hardware + 0.30 * cert + 0.20 * vendor, 2), 100.0)
    return mds, {"legacy_tls_score": legacy, "hardware_score": hardware,
                 "cert_score": cert, "vendor_score": vendor}


# ── QRMM Level ───────────────────────────────────────────────────
def _pqc_compute_qrmm(tls_ver: float, pfs_present: bool,
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


# ── Certification status ─────────────────────────────────────────
def _pqc_cert_status(hei: float, uses_pqc: bool, uses_hybrid: bool) -> str:
    if uses_pqc:
        return "PQC Ready"
    if uses_hybrid and hei <= 50:
        return "Hybrid Secure"
    return "Not Quantum Safe"


# ── Asset-key helper ─────────────────────────────────────────────
def _pqc_asset_key(asset: dict) -> str:
    return str(_pqc_get(asset, "asset_name") or "").strip().lower()


# ── Core: enrich one asset ───────────────────────────────────────
def _pqc_enrich_one(asset: dict,
                    shadow_findings: list = None,
                    shadow_record: dict = None) -> dict:
    out = dict(asset)
    if shadow_findings:
        out["Shadow_Crypto_Findings"] = shadow_findings

    scan_status   = _pqc_str(asset, "scan_status").lower()
    error_msg     = _pqc_str(asset, "error_msg")
    is_scan_error = (scan_status == "error") or (
        scan_status not in ("ok", "success", "")
        and scan_status != ""
    ) or (
        scan_status == "" and bool(error_msg)
        and not _pqc_has_any_tls_data(asset)
    )

    error_class = None
    if is_scan_error or error_msg:
        error_class = _pqc_classify_error(error_msg)

    working     = dict(asset)
    data_source = "cbom"

    # Level 1: fill missing cipher/KEX from probe details
    if not _pqc_str(working, "cipher_suite") or not _pqc_str(working, "kex_algo"):
        recovered = _pqc_extract_from_best_probe(working)
        if recovered:
            for k, v in recovered.items():
                if k not in working or not working[k]:
                    working[k] = v
            if not _pqc_str(asset, "cipher_suite") and not _pqc_str(asset, "kex_algo"):
                data_source = "cbom+probe"

    # Level 2: shadow record rescue for error assets
    if is_scan_error and not _pqc_has_any_tls_data(working) and shadow_record:
        shadow_ok = str(_pqc_get(shadow_record, "scan_status") or "").lower()
        if shadow_ok == "ok" or _pqc_effective_tls(shadow_record) > 0:
            working = dict(shadow_record)
            for keep in ("Asset ID", "Asset", "IP Address", "Port"):
                if keep in asset:
                    working[keep] = asset[keep]
            data_source   = "shadow_rescue"
            is_scan_error = False
            error_class   = None

    has_data       = _pqc_has_any_tls_data(working)
    error_defaults = None
    inferred       = False

    if is_scan_error and not has_data and error_class:
        score_defaults = _PQC_ERROR_SCORE_DEFAULTS.get(error_class)
        if score_defaults is None:
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
        error_defaults = score_defaults
        inferred       = True
        data_source    = f"inferred_{error_class.lower()}"

    elif is_scan_error and not has_data:
        error_defaults = _PQC_ERROR_SCORE_DEFAULTS["UNKNOWN_ERROR"]
        inferred       = True
        data_source    = "inferred_unknown_error"

    if not has_data and not inferred:
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

    hei, hei_bd  = _pqc_compute_hei(working, shadow_findings, error_defaults)
    tls_for_qrmm = hei_bd["tls_version_for_qrmm"]
    uses_pqc     = hei_bd["uses_pqc_kem"]
    uses_hybrid  = hei_bd["uses_hybrid"]
    pfs_present  = hei_bd["pfs_present"]

    mds, mds_fac = _pqc_compute_mds(working, tls_for_qrmm, shadow_findings, error_class)
    qrmm         = _pqc_compute_qrmm(tls_for_qrmm, pfs_present, uses_pqc, uses_hybrid)
    cert_status  = _pqc_cert_status(hei, uses_pqc, uses_hybrid)

    priority_score = round(hei * (1 - mds / 100), 1) if hei is not None else None

    confidence_map = {
        "cbom":                              "full",
        "cbom+probe":                        "partial_probe",
        "shadow_rescue":                     "partial_shadow",
        "inferred_tls_negotiation_failure":  "inferred_tls_failure",
        "inferred_certificate_issue":        "inferred_cert_issue",
        "inferred_timeout":                  "inferred_timeout",
        "inferred_unknown_error":            "inferred_unknown",
    }
    confidence = confidence_map.get(data_source, data_source)

    update = {
        "HEI_Score":            hei,
        "Risk_Category":        _pqc_risk_category(hei),
        "MDS_Score":            mds,
        "QRMM_Level":           qrmm,
        "Certification_Status": cert_status,
        "Remediation_Priority": priority_score,
        "Scoring_Confidence":   confidence,
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


# ── Summary dict ─────────────────────────────────────────────────
def _pqc_summary_dict(enriched: list) -> dict:
    scored  = [a for a in enriched if a.get("HEI_Score") is not None]
    heis    = [a["HEI_Score"] for a in scored]
    mdss    = [a["MDS_Score"]  for a in scored]

    def dist(key, labels):
        return {lb: sum(1 for a in enriched if a.get(key) == lb) for lb in labels}

    def hei_stats(subset):
        h = [a["HEI_Score"] for a in subset if a.get("HEI_Score") is not None]
        return {"count": len(h),
                "avg":   round(sum(h)/len(h), 2) if h else None,
                "min":   min(h) if h else None,
                "max":   max(h) if h else None}

    confidence_counts: dict = {}
    for a in enriched:
        c = a.get("Scoring_Confidence", "none")
        confidence_counts[c] = confidence_counts.get(c, 0) + 1

    full_scored     = [a for a in scored if a.get("Scoring_Confidence") in
                       ("full", "partial_probe", "partial_shadow")]
    inferred_scored = [a for a in scored if a.get("Scoring_Confidence", "").startswith("inferred")]

    now = _dt.datetime.now()
    expiry_counts = {"expired": 0, "within_30d": 0, "within_90d": 0,
                     "within_365d": 0, "ok": 0, "unknown": 0}
    for a in enriched:
        validity      = a.get("Certificate Validity (Not Before/After)") or {}
        not_after_str = str(validity.get("Not After") or validity.get("not_after") or "")
        if not not_after_str:
            expiry_counts["unknown"] += 1
            continue
        try:
            clean     = re.sub(r"[+-]\d{2}:\d{2}$", "", not_after_str.replace("Z", ""))
            not_after = _dt.datetime.fromisoformat(clean)
            days      = (not_after - now).days
            if   days < 0:    expiry_counts["expired"]     += 1
            elif days < 30:   expiry_counts["within_30d"]  += 1
            elif days < 90:   expiry_counts["within_90d"]  += 1
            elif days < 365:  expiry_counts["within_365d"] += 1
            else:             expiry_counts["ok"]          += 1
        except (ValueError, TypeError):
            expiry_counts["unknown"] += 1

    seen_hosts = {}
    for a in full_scored:
        if a.get("Remediation_Priority") is None:
            continue
        hostname = str(a.get("Asset") or a.get("asset") or "").strip().lower()
        existing = seen_hosts.get(hostname)
        if existing is None or (a.get("HEI_Score") or 0) >= (existing.get("HEI_Score") or 0):
            seen_hosts[hostname] = a

    top_priority = sorted(seen_hosts.values(),
                          key=lambda a: a.get("Remediation_Priority", 0),
                          reverse=True)[:10]

    top_priority_list = [
        {"asset":       str(a.get("Asset") or a.get("asset") or "?"),
         "port":        a.get("Port") or a.get("port") or 443,
         "HEI":         a.get("HEI_Score"),
         "MDS":         a.get("MDS_Score"),
         "priority":    a.get("Remediation_Priority"),
         "QRMM":        a.get("QRMM_Level", {}).get("level"),
         "QRMM_label":  a.get("QRMM_Level", {}).get("label", ""),
         "confidence":  a.get("Scoring_Confidence")}
        for a in top_priority
    ]

    unreachable    = sum(1 for a in enriched if a.get("Risk_Category") == "Unscored_Unreachable")
    truly_unscored = sum(1 for a in enriched
                         if a.get("HEI_Score") is None
                         and a.get("Risk_Category") not in ("Unscored_Unreachable",))
    shadow_adjusted = sum(1 for a in enriched
                          if a.get("_PQC_Model_Details", {})
                             .get("HEI_breakdown", {})
                             .get("shadow_hei_bonus", 0) > 0)

    # ── Asset type & infrastructure aggregations ────────────────────
    asset_type_counts: dict[str, int] = {}
    subnet_counts: dict[str, int] = {}
    infra_cdn_count = 0
    infra_waf_count = 0
    infra_lb_count = 0
    os_counts: dict[str, int] = {}
    cipher_strength_counts: dict[str, int] = {"Strong": 0, "Moderate": 0, "Weak": 0, "Unknown": 0}

    for a in enriched:
        # Asset type
        at = a.get("Asset Type", "unknown")
        asset_type_counts[at] = asset_type_counts.get(at, 0) + 1

        # Subnet
        nd = a.get("Network Details")
        if isinstance(nd, dict) and nd.get("ip_subnet"):
            sn = nd["ip_subnet"]
            subnet_counts[sn] = subnet_counts.get(sn, 0) + 1

        # Infrastructure
        infra = a.get("Infrastructure")
        if isinstance(infra, dict):
            if infra.get("cdn_provider"):
                infra_cdn_count += 1
            if infra.get("waf_detected"):
                infra_waf_count += 1
            if infra.get("load_balanced"):
                infra_lb_count += 1

        # OS distribution
        os_val = a.get("Detected OS", "Unknown")
        if os_val:
            os_counts[os_val] = os_counts.get(os_val, 0) + 1

        # SSL cipher strength
        ssl_d = a.get("SSL Details")
        if isinstance(ssl_d, dict):
            cs = ssl_d.get("cipher_strength", "Unknown")
            cipher_strength_counts[cs] = cipher_strength_counts.get(cs, 0) + 1

    # Sort subnets by count (descending)
    sorted_subnets = dict(sorted(subnet_counts.items(), key=lambda x: x[1], reverse=True)[:20])

    return {
        "total_assets":         len(enriched),
        "scored":               len(scored),
        "scored_full_data":     len(full_scored),
        "scored_inferred":      len(inferred_scored),
        "unscored_unreachable": unreachable,
        "unscored_no_data":     truly_unscored,
        "shadow_annotated":     sum(1 for a in enriched if a.get("Shadow_Crypto_Findings")),
        "shadow_hei_adjusted":  shadow_adjusted,
        "scoring_confidence":   confidence_counts,
        "HEI": hei_stats(scored),
        "HEI_all_scored":       hei_stats(scored),
        "HEI_full_data_only":   hei_stats(full_scored),
        "HEI_inferred_only":    hei_stats(inferred_scored),
        "MDS": {"avg": round(sum(mdss)/len(mdss), 2) if mdss else None,
                "min": min(mdss) if mdss else None,
                "max": max(mdss) if mdss else None},
        "cert_expiry":          expiry_counts,
        "top10_by_priority":    top_priority_list,
        "risk_distribution":    dist("Risk_Category",        ["Low", "Moderate", "High", "Critical"]),
        "cert_distribution":    dist("Certification_Status", ["PQC Ready", "Hybrid Secure", "Not Quantum Safe"]),
        "qrmm_distribution": {
            f"Level_{lvl}": sum(1 for a in scored
                                if isinstance(a.get("QRMM_Level"), dict)
                                and a["QRMM_Level"].get("level") == lvl)
            for lvl in range(4)
        },
        "asset_type_distribution": asset_type_counts,
        "subnet_summary":          sorted_subnets,
        "infrastructure_summary": {
            "cdn_detected":    infra_cdn_count,
            "waf_detected":    infra_waf_count,
            "load_balanced":   infra_lb_count,
        },
        "os_distribution":         os_counts,
        "cipher_strength_distribution": cipher_strength_counts,
    }


def enrich_all(cbom_records: list[dict],
               shadow_records: list[dict]) -> tuple[list[dict], dict]:
    """
    Enrich a list of CBOM records with PQC risk scores.
    Shadow records are used for data rescue and annotation.
    Returns (enriched_list, summary_dict).
    """
    # Build shadow lookup structures from shadow_records
    findings_by_asset: dict[str, list] = {}
    records_by_asset:  dict[str, dict] = {}
    for r in shadow_records:
        key = str(r.get("Asset") or "").strip().lower()
        if key:
            findings_by_asset.setdefault(key, [])
            # Treat each shadow record as a "self_signed_cert" or "weak_tls" finding
            # based on Shadow Crypto Reasons presence
            for reason in (r.get("Shadow Crypto Reasons") or []):
                findings_by_asset[key].append({
                    "finding_type": _shadow_reason_to_type(reason),
                    "asset": key,
                    "details": {"reason": reason},
                })
            records_by_asset[key] = r

    enriched = []
    for a in cbom_records:
        key = _pqc_asset_key(a)
        enriched.append(_pqc_enrich_one(
            a,
            shadow_findings=findings_by_asset.get(key),
            shadow_record=records_by_asset.get(key),
        ))

    summary = _pqc_summary_dict(enriched)
    return enriched, summary


def _shadow_reason_to_type(reason: str) -> str:
    """Map a Shadow Crypto reason string to a finding_type used by the enrichment engine."""
    r = reason.lower()
    if "self" in r and "sign" in r:
        return "self_signed_cert"
    if "mismatch" in r:
        return "cert_mismatch"
    if "tls" in r and ("weak" in r or "1.0" in r or "1.1" in r):
        return "weak_tls"
    return "shadow_crypto"


# -----------------------------
# Merge / diff helpers
# -----------------------------

CBOM_DIFF_KEYS = [
    "TLS Version", "Cipher Suite", "Key Exchange Algorithm",
    "Key Size (Bits)", "PFS Status", "Issuer CA", "Scan Status",
    "IP Address", "NIST PQC Readiness Label",
]


def _read_existing_json(path: Path) -> Any:
    """Read existing JSON file, returning None on any error."""
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _extract_records(data: Any) -> list[dict]:
    """Extract record list from either a flat list or a {records:[...]} / {subdomains:[...]} wrapper."""
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("records", "subdomains", "findings"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []


def _extract_subdomains_list(data: Any) -> list[str]:
    """Extract flat list of FQDN strings from the subdomains JSON (flat or wrapped)."""
    if data is None:
        return []
    if isinstance(data, list):
        result = []
        for item in data:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict) and item.get("fqdn"):
                result.append(item["fqdn"])
        return result
    if isinstance(data, dict):
        subs = data.get("subdomains", [])
        result = []
        for item in subs:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict) and item.get("fqdn"):
                result.append(item["fqdn"])
        return result
    return []


def _cbom_fingerprint(record: dict) -> str:
    """Stable hash of key CBOM fields to detect changes."""
    return "|".join(str(record.get(k, "")) for k in CBOM_DIFF_KEYS)


def merge_cbom(existing_records: list[dict], new_records: list[dict]) -> tuple[list[dict], dict]:
    """
    Merge new scan records into existing ones.
    - Key is (Asset, Port) so the same hostname on different ports are tracked independently.
    - New records always win for asset+port combos they contain (updated or unchanged).
    - Existing-only asset+port combos are preserved as-is.
    Returns (merged_list, diff_stats).
    """
    def _cbom_key(r: dict) -> tuple:
        return (str(r.get("Asset", "")), int(r.get("Port", 443)))

    existing_map: dict[tuple, dict] = {_cbom_key(r): r for r in existing_records if r.get("Asset")}
    new_map: dict[tuple, dict] = {_cbom_key(r): r for r in new_records if r.get("Asset")}

    added = 0
    updated = 0
    unchanged = 0

    merged: list[dict] = []

    # Process new records first
    for key, new_rec in new_map.items():
        if key not in existing_map:
            merged.append(new_rec)
            added += 1
        else:
            old_rec = existing_map[key]
            if _cbom_fingerprint(new_rec) != _cbom_fingerprint(old_rec):
                merged.append(new_rec)
                updated += 1
            else:
                merged.append(old_rec)  # keep old (identical)
                unchanged += 1

    # Preserve existing asset+port combos not in new scan
    for key, old_rec in existing_map.items():
        if key not in new_map:
            merged.append(old_rec)

    # Sort by (Asset, Port) for stable output
    merged.sort(key=lambda r: (r.get("Asset", ""), int(r.get("Port", 443))))

    diff = {"added": added, "updated": updated, "unchanged": unchanged, "preserved": len(existing_map) - updated - unchanged}
    return merged, diff


def merge_subdomains(existing_fqdns: list[str], new_fqdns: list[str]) -> tuple[list[str], dict]:
    """Union of old + new subdomains, deduplicated and sorted."""
    existing_set = set(existing_fqdns)
    new_set = set(new_fqdns)
    added = len(new_set - existing_set)
    merged = sorted(existing_set | new_set)
    return merged, {"added": added, "total": len(merged)}


def prepare_outputs(records: list[dict], subdomains: list[str], output_dir: str) -> dict:
    # Include ALL scanned records (ok + error) so new domains are always persisted
    # to cbom.json, subdomains.json, and enriched_cbom.json regardless of TLS outcome.
    new_cbom_records = records
    shadow_records = [build_shadow_crypto_record(r) for r in records if is_valid_crypto_record(r) and is_shadow_crypto_record(r)]

    out = Path(output_dir)
    if out.exists() and out.is_file():
        out = out.parent

    if output_dir and str(output_dir).strip():
        out.mkdir(parents=True, exist_ok=True)

    subdomains_path = out / "subdomains.json"
    cbom_path       = out / "cbom.json"
    shadow_path     = out / "shadow_crypto.json"

    # ── Read existing files ──────────────────────────────────────────────────
    existing_cbom_data     = _read_existing_json(cbom_path)
    existing_sub_data      = _read_existing_json(subdomains_path)

    existing_cbom_records  = _extract_records(existing_cbom_data)
    existing_fqdns         = _extract_subdomains_list(existing_sub_data)

    # ── Merge CBOM ───────────────────────────────────────────────────────────
    merged_cbom, cbom_diff = merge_cbom(existing_cbom_records, new_cbom_records)

    # ── Merge subdomains ─────────────────────────────────────────────────────
    merged_subs, subs_diff = merge_subdomains(existing_fqdns, subdomains)

    # ── Write files only when there are changes ──────────────────────────────
    cbom_changed = cbom_diff["added"] > 0 or cbom_diff["updated"] > 0
    subs_changed = subs_diff["added"] > 0

    if cbom_changed or not cbom_path.exists():
        write_json_file(cbom_path, merged_cbom)

    if subs_changed or not subdomains_path.exists():
        write_json_file(subdomains_path, merged_subs)

    # Shadow crypto always rewritten (derived from merged CBOM)
    merged_shadow = [build_shadow_crypto_record(r) for r in merged_cbom if is_shadow_crypto_record(r)]
    write_json_file(shadow_path, merged_shadow)

    # ── PQC Enrichment → enriched_cbom.json ──────────────────────────────────
    enriched_path = out / "enriched_cbom.json"
    enriched_cbom_records, enrichment_summary = enrich_all(merged_cbom, merged_shadow)
    enriched_output = {
        "_PQC_Enrichment_Summary": enrichment_summary,
        "generated_at_utc":        datetime.now(timezone.utc).isoformat(),
        "count_records":           len(enriched_cbom_records),
        "records":                 enriched_cbom_records,
    }
    write_json_file(enriched_path, enriched_output)

    return {
        "subdomains_path":      str(subdomains_path),
        "cbom_path":            str(cbom_path),
        "shadow_crypto_path":   str(shadow_path),
        "enriched_cbom_path":   str(enriched_path),
        "subdomains":           merged_subs,
        "cbom":                 new_cbom_records,   # return only this-scan records to the UI
        "shadow_crypto":        shadow_records,
        "enrichment_summary":   enrichment_summary,
        "diff": {
            "cbom":       cbom_diff,
            "subdomains": subs_diff,
        },
    }



# -----------------------------
# Scan runner
# -----------------------------
async def run_scan(req: ScanRequest) -> dict:
    # SSRF protection: filter out targets that resolve to private/internal IPs
    normalized_targets = [normalize_host(t) for t in req.targets if normalize_host(t)]
    if not _ALLOW_INTERNAL_SCAN:
        safe_targets = [t for t in normalized_targets if _validate_target_ssrf(t)]
        blocked = len(normalized_targets) - len(safe_targets)
        if blocked > 0 and not safe_targets:
            return {
                "total_scanned": 0, "ok": 0, "errors": 0,
                "error": f"All {blocked} target(s) blocked by SSRF protection (internal IPs). Set ALLOW_INTERNAL_SCAN=true to override.",
                "subdomains": [], "cbom": [], "shadow_crypto": [],
                "subdomains_path": None, "cbom_path": None, "shadow_crypto_path": None,
                "scanned_at": datetime.now(timezone.utc).isoformat(),
            }
        normalized_targets = safe_targets
    enumerated_targets = set(normalized_targets)

    host_ips: dict[str, str | None] = {}

    for host in sorted(enumerated_targets):
        ip = await asyncio.get_event_loop().run_in_executor(
            None, resolve_host, host, req.resolve_timeout
        )
        host_ips[host] = ip

    if req.enumerate_subdomains:
        for host in sorted(normalized_targets):
            subs = await asyncio.get_event_loop().run_in_executor(None, enumerate_from_crtsh, host)
            for sub in subs:
                enumerated_targets.add(normalize_host(sub))

        for host in sorted(enumerated_targets):
            if host not in host_ips:
                ip = await asyncio.get_event_loop().run_in_executor(
                    None, resolve_host, host, req.resolve_timeout
                )
                host_ips[host] = ip

    subdomains = sorted(enumerated_targets)

    all_targets: list[tuple[str, int]] = []
    seen_assets: set[tuple[str, int]] = set()

    for host in subdomains:
        for port in req.ports:
            asset_key = (host, int(port))
            if asset_key not in seen_assets:
                seen_assets.add(asset_key)
                all_targets.append(asset_key)

    scanned_records: list[dict] = []

    for host, port in all_targets:
        ip = host_ips.get(host)

        probe_results: dict[str, tuple[bool, dict]] = {}
        for tls_ver in TLS_PROBE_ORDER:
            success, meta = await asyncio.get_event_loop().run_in_executor(
                None, probe_single_tls_version, host, port, tls_ver, req.tls_timeout
            )
            probe_results[tls_ver] = (success, meta)

        record = await asyncio.get_event_loop().run_in_executor(
            None, build_cbom_record, host, port, ip, probe_results, req.tls_timeout
        )
        scanned_records.append(record)

    outputs = prepare_outputs(scanned_records, subdomains, req.output_dir) if req.write_files else {
        "subdomains_path": None,
        "cbom_path": None,
        "shadow_crypto_path": None,
        "subdomains": subdomains,
        "cbom": [r for r in scanned_records if is_valid_crypto_record(r)],
        "shadow_crypto": [build_shadow_crypto_record(r) for r in scanned_records if is_shadow_crypto_record(r) and is_valid_crypto_record(r)],
    }

    return {
        "total_scanned": len(scanned_records),
        "ok": sum(1 for r in scanned_records if r.get("Scan Status") == "ok"),
        "errors": sum(1 for r in scanned_records if r.get("Scan Status") != "ok"),
        "subdomains": outputs["subdomains"],
        "cbom": outputs["cbom"],
        "shadow_crypto": outputs["shadow_crypto"],
        "subdomains_path": outputs["subdomains_path"],
        "cbom_path": outputs["cbom_path"],
        "shadow_crypto_path": outputs["shadow_crypto_path"],
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


# -----------------------------
# SSE stream
# -----------------------------
async def run_scan_stream(req: ScanRequest):
    def emit(event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"

    def log(level: str, msg: str) -> str:
        return emit("log", {"level": level, "message": msg})

    yield log("INFO", "Starting scan...")
    yield log("INFO", f"Targets: {', '.join(req.targets)}")
    yield log("INFO", f"Ports: {req.ports}")
    yield emit("progress", {"phase": 0, "pct": 5, "label": "Resolving DNS"})

    normalized_targets = [normalize_host(t) for t in req.targets if normalize_host(t)]
    enumerated_targets = set(normalized_targets)
    host_ips: dict[str, str | None] = {}

    for host in sorted(enumerated_targets):
        yield log("INFO", f"Resolving {host}...")
        ip = await asyncio.get_event_loop().run_in_executor(
            None, resolve_host, host, req.resolve_timeout
        )
        host_ips[host] = ip
        if ip:
            yield log("INFO", f"  {host} -> {ip}")
        else:
            yield log("WARN", f"  {host} -> could not resolve (will still attempt probe)")

    yield emit("progress", {"phase": 0, "pct": 15, "label": "Resolving DNS"})

    yield emit("progress", {"phase": 1, "pct": 20, "label": "Enumerating Assets"})

    if req.enumerate_subdomains:
        yield log("INFO", "Enumerating subdomains via crt.sh...")
        for host in sorted(normalized_targets):
            yield log("INFO", f"  Querying crt.sh for {host}...")
            subs = await asyncio.get_event_loop().run_in_executor(None, enumerate_from_crtsh, host)
            if subs:
                yield log("INFO", f"  Found {len(subs)} subdomains for {host}")
                for sub in subs:
                    sub = normalize_host(sub)
                    if sub not in enumerated_targets:
                        enumerated_targets.add(sub)
                        ip = await asyncio.get_event_loop().run_in_executor(
                            None, resolve_host, sub, req.resolve_timeout
                        )
                        host_ips[sub] = ip
            else:
                yield log("INFO", f"  No subdomains found for {host}")

    subdomains = sorted(enumerated_targets)
    all_targets: list[tuple[str, int]] = []
    seen_assets: set[tuple[str, int]] = set()
    for host in subdomains:
        for port in req.ports:
            asset_key = (host, int(port))
            if asset_key not in seen_assets:
                seen_assets.add(asset_key)
                all_targets.append(asset_key)

    yield log("INFO", f"Probing {len(all_targets)} target(s)...")
    yield emit("progress", {"phase": 1, "pct": 35, "label": "Enumerating Assets"})
    yield emit("progress", {"phase": 2, "pct": 40, "label": "TLS Handshake Probes"})

    scanned_records: list[dict] = []
    total = len(all_targets)

    for idx, (host, port) in enumerate(all_targets):
        ip = host_ips.get(host)
        yield log("INFO", f"Probing {host}:{port}...")

        probe_results: dict[str, tuple[bool, dict]] = {}

        for tls_ver in TLS_PROBE_ORDER:
            success, meta = await asyncio.get_event_loop().run_in_executor(
                None, probe_single_tls_version, host, port, tls_ver, req.tls_timeout
            )
            probe_results[tls_ver] = (success, meta)

            if success:
                yield log("DEBUG", f"  {tls_ver} ✓ — cipher: {meta.get('cipher_tuple', ('?',))[0]}")
            else:
                yield log("DEBUG", f"  {tls_ver} ✗")

        supported = [v for v in TLS_PROBE_ORDER if probe_results.get(v, (False,))[0]]

        if supported:
            min_ver = supported[0]
            max_ver = supported[-1]
            if min_ver in ("TLSv1.0", "TLSv1.1"):
                yield log("WARN", f"  {host}: Supports deprecated {min_ver}")
            _, best_meta = probe_results[max_ver]
            ct = best_meta.get("cipher_tuple")
            if ct and ("DES" in ct[0] or "RC4" in ct[0] or "NULL" in ct[0]):
                yield log("WARN", f"  {host}: Weak cipher — {ct[0]}")
            latency = best_meta.get("latency_ms")
            if latency:
                yield log("INFO", f"  {host} — latency: {latency}ms")
        else:
            yield log("ERROR", f"  {host}:{port} — No TLS version successfully negotiated")

        record = await asyncio.get_event_loop().run_in_executor(
            None, build_cbom_record, host, port, ip, probe_results, req.tls_timeout
        )

        scanned_records.append(record)

        include_cbom = is_valid_crypto_record(record)
        include_shadow = is_shadow_crypto_record(record)

        yield emit("result", {
            **record,
            "Included In CBOM": include_cbom,
            "Included In Shadow Crypto": include_shadow,
        })

        pct = 40 + int((idx + 1) / total * 45)
        yield emit("progress", {"phase": 2, "pct": pct, "label": "TLS Handshake Probes"})

    yield emit("progress", {"phase": 3, "pct": 88, "label": "Cert / Web Fingerprint Summary"})
    yield log("INFO", "Fingerprinting complete.")

    outputs = prepare_outputs(scanned_records, subdomains, req.output_dir) if req.write_files else {
        "subdomains_path": None,
        "cbom_path": None,
        "shadow_crypto_path": None,
        "subdomains": subdomains,
        "cbom": [r for r in scanned_records if is_valid_crypto_record(r)],
        "shadow_crypto": [build_shadow_crypto_record(r) for r in scanned_records if is_shadow_crypto_record(r) and is_valid_crypto_record(r)],
        "diff": {"cbom": {"added": 0, "updated": 0, "unchanged": 0, "preserved": 0}, "subdomains": {"added": 0, "total": 0}},
    }

    ok_count = sum(1 for r in outputs["cbom"] if r.get("Scan Status") == "ok")
    err_count = len(scanned_records) - ok_count

    yield emit("progress", {"phase": 4, "pct": 95, "label": "Writing Outputs"})
    diff = outputs.get("diff", {})
    cbom_diff = diff.get("cbom", {})
    subs_diff = diff.get("subdomains", {})
    yield log("INFO", f"Merge complete — CBOM: +{cbom_diff.get('added',0)} new, ~{cbom_diff.get('updated',0)} updated, ={cbom_diff.get('unchanged',0)} unchanged, {cbom_diff.get('preserved',0)} preserved from previous scan")
    yield log("INFO", f"Subdomains: +{subs_diff.get('added',0)} new, {subs_diff.get('total',0)} total")
    yield log("INFO", f"Running PQC enrichment on {len(outputs['cbom'])} records...")
    yield log("INFO", f"Writing cbom.json, shadow_crypto.json, enriched_cbom.json to {req.output_dir}")
    yield emit("progress", {"phase": 4, "pct": 100, "label": "Writing Outputs"})
    yield log("INFO", f"✅ Scan complete. {len(scanned_records)} asset(s) processed.")

    yield emit("done", {
        "total_scanned":      len(scanned_records),
        "ok":                 ok_count,
        "errors":             err_count,
        "subdomains":         outputs["subdomains"],
        "cbom":               outputs["cbom"],
        "shadow_crypto":      outputs["shadow_crypto"],
        "subdomains_path":    outputs["subdomains_path"],
        "cbom_path":          outputs["cbom_path"],
        "shadow_crypto_path": outputs["shadow_crypto_path"],
        "enriched_cbom_path": outputs.get("enriched_cbom_path"),
        "enrichment_summary": outputs.get("enrichment_summary"),
        "diff":               outputs.get("diff", {}),
        "scanned_at":         datetime.now(timezone.utc).isoformat(),
    })


# -----------------------------
# Routes
# -----------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "QRIE Scanner API", "version": "3.0.0"}


@app.post("/api/scan/stream")
async def scan_stream(request: Request, req: ScanRequest):
    _check_rate_limit(request)
    _verify_api_key(request)
    # Validate output_dir for path traversal
    if req.write_files:
        _validate_output_dir(req.output_dir)
    return StreamingResponse(
        run_scan_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/scan")
async def scan_blocking(request: Request, req: ScanRequest):
    _check_rate_limit(request)
    _verify_api_key(request)
    # Validate output_dir for path traversal
    if req.write_files:
        _validate_output_dir(req.output_dir)
    return await run_scan(req)


# -----------------------------
# Entry point
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    _host = os.environ.get("SCANNER_HOST", "127.0.0.1")
    _port = int(os.environ.get("SCANNER_PORT", "8000"))
    uvicorn.run("scanner_api:app", host=_host, port=_port, reload=True)
