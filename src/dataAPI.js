/**
 * Data Loading Utility
 * Loads JSON data files from public/data folder (used during development)
 * Falls back to API calls in production
 */

import { formatAssetTypeLabel, getIpVersionLabel } from './utils/assetFormatting'

const DATA_API_BASE = import.meta.env.VITE_DATA_API_BASE_URL || '/api'

const DATASET_ENDPOINTS = {
  'PNB/enriched_cbom.json': `${DATA_API_BASE}/datasets/enriched-cbom`,
  'PNB/subdomains.json': `${DATA_API_BASE}/datasets/subdomains`,
  'PNB/shadow-crypto.json': `${DATA_API_BASE}/datasets/shadow-crypto`,
  'PNB/shadow_crypto.json': `${DATA_API_BASE}/datasets/shadow-crypto`,
  'simulation.json': `${DATA_API_BASE}/datasets/simulation`,
}

// Load JSON-compatible datasets through the API layer
const loadJSONData = async (path) => {
  try {
    const endpoint = DATASET_ENDPOINTS[path]
    if (!endpoint) {
      throw new Error(`No API dataset mapping configured for ${path}`)
    }

    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error(`Error loading dataset ${path}:`, error)
    return null
  }
}

/**
 * Normalises subdomains.json — handles two formats:
 *   1. Flat array:  ["fqdn1", "fqdn2", ...]
 *   2. Object:      { subdomains: [{fqdn, ips, ...}], count_assets: N }
 * Always returns { subdomains: [{fqdn, ips, status, asset_type, sources, resolved_at_utc}], count_assets: N }
 */
const normalizeSubdomainsData = (raw) => {
  if (!raw) return { subdomains: [], count_assets: 0 }
  // Flat string array format
  if (Array.isArray(raw)) {
    const subs = raw.map(fqdn => ({
      fqdn,
      ips: [],
      status: 'active',
      asset_type: fqdn.split('.')[0] === 'api' ? 'api' : 'domain',
      sources: [],
      resolved_at_utc: new Date().toISOString(),
    }))
    return { subdomains: subs, count_assets: subs.length }
  }
  // Object format
  return {
    subdomains: raw.subdomains || [],
    count_assets: raw.count_assets || (raw.subdomains || []).length,
  }
}

// Normalize functions — now includes all new enrichment fields
const normalizeAsset = (asset) => ({
  id: asset['Asset ID'],
  name: asset.Asset,
  url: `https://${asset.Asset}`,
  ip: asset['IP Address'],
  port: asset.Port,
  // Asset classification
  assetType: asset['Asset Type'] || 'unknown',
  assetTypeDetails: asset['Asset Type Details'] || {},
  // SSL Details (new)
  sslDetails: asset['SSL Details'] || {},
  // API Details (new)
  apiDetails: asset['API Details'] || {},
  // Network Details (new)
  networkDetails: asset['Network Details'] || {},
  // Infrastructure (new)
  infrastructure: asset['Infrastructure'] || {},
  // TLS
  tlsVersions: asset['Supported TLS Versions'] || [],
  minTls: asset['Minimum Supported TLS'],
  maxTls: asset['Maximum Supported TLS'],
  tlsVersion: asset['TLS Version'],
  cipherSuite: asset['Cipher Suite'],
  keyExchange: asset['Key Exchange Algorithm'],
  encryption: asset['Encryption Algorithm'],
  hash: asset['Hash Algorithm'],
  keyBits: asset['Key Size (Bits)'],
  pfs: asset['PFS Status'] === 'Yes',
  issuer: asset['Issuer CA'],
  notBefore: asset['Certificate Validity (Not Before/After)']?.['Not Before'],
  notAfter: asset['Certificate Validity (Not Before/After)']?.['Not After'],
  // HTTP fingerprint
  webServer: asset['Web Server'],
  detectedOS: asset['Detected OS'],
  osConfidence: asset['OS Confidence'],
  pageTitle: asset['Page Title'],
  techHints: asset['Technology Hints'] || [],
  softwareVersions: asset['Software Versions'] || [],
  httpStatus: asset['HTTP Status'],
  // PQC
  heiScore: asset.HEI_Score || 50,
  riskCategory: asset.Risk_Category || 'Moderate',
  pqcLabel: asset['NIST PQC Readiness Label'] || '',
  // Cert
  scanStatus: asset['Scan Status'],
  subjectCN: asset['Subject CN'],
  signatureAlgo: asset['Signature Algorithm'],
})

const normalizeSubdomain = (sub) => ({
  fqdn: sub.fqdn,
  ips: sub.ips || [],
  status: sub.status,
  type: sub.asset_type,
  sources: sub.sources || [],
  resolvedAt: sub.resolved_at_utc,
})

const normalizeFinding = (finding) => ({
  type: finding.finding_type,
  severity: finding.severity,
  asset: finding.asset,
  ip: finding.ip_address,
  port: finding.port,
  description: finding.description,
  recommendation: finding.recommendation,
  details: finding.details,
})

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deduplicates enriched_cbom records by unique domain (Asset field).
 * Strategy: prefer the port-443 ok-scan record; fall back to any ok-scan record.
 * This ensures every page works from the same canonical unique-domain list.
 */
const dedupeByDomain = (records) => {
  const map = new Map()
  for (const r of records) {
    const key = r.Asset
    if (!map.has(key)) {
      map.set(key, r)
    } else {
      const existing = map.get(key)
      // Prefer port-443 ok record over anything else
      const rOk = r['Scan Status'] === 'ok'
      const existOk = existing['Scan Status'] === 'ok'
      if (rOk && r.Port === 443) map.set(key, r)
      else if (rOk && !existOk) map.set(key, r)
    }
  }
  return Array.from(map.values())
}

// Pretty-prints an asset type key like "web_application" → "Web Application"
const fmtAssetType = (key) => formatAssetTypeLabel(key)

// Canonical color palette for asset types
const ASSET_TYPE_COLORS = {
  web_application: '#3b82f6',
  api:             '#6366f1',
  web_server:      '#0ea5e9',
  database:        '#f59e0b',
  mail_server:     '#10b981',
  dns_server:      '#8b5cf6',
  cdn_proxy:       '#ec4899',
  load_balancer:   '#f97316',
  ssl_certificate: '#14b8a6',
  ip_address:      '#64748b',
  domain:          '#22c55e',
  unknown:         '#94a3b8',
}
const assetTypeColor = (key) => ASSET_TYPE_COLORS[key] || '#94a3b8'

// ─────────────────────────────────────────────────────────────────────────────
// Public Data APIs
// ─────────────────────────────────────────────────────────────────────────────

export const dataAPI = {
  // Dashboard Metrics
  getDashboardData: async () => {
    try {
      const [cbomRaw, subRaw] = await Promise.all([
        loadJSONData('PNB/enriched_cbom.json'),
        loadJSONData('PNB/subdomains.json')
      ])

      const summary = cbomRaw?._PQC_Enrichment_Summary || {}
      const assets = dedupeByDomain(cbomRaw?.records || [])
      const { subdomains: subs } = normalizeSubdomainsData(subRaw)
      const totalUniqueAssets = assets.length

      // ── Use new enrichment summary fields if present ────────────────────────
      const atDist = summary.asset_type_distribution || {}
      const infraSum = summary.infrastructure_summary || {}
      const subnetSum = summary.subnet_summary || {}
      const cipherStrDist = summary.cipher_strength_distribution || {}

      // Derived counts from asset type distribution
      const webApps = (atDist.web_application || 0) + (atDist.web_server || 0)
      const apis     = atDist.api || 0
      const servers  = (atDist.database || 0) + (atDist.mail_server || 0) + (atDist.dns_server || 0)
      const cdns     = (atDist.cdn_proxy || 0) + (atDist.load_balancer || 0)

      let expiring = 0
      let highRisk = 0
      let riskCounts = { Critical: 0, Legacy: 0, Standard: 0, Elite: 0 }
      let certCounts = { '0-30 Days': 0, '30-60 Days': 0, '60-90 Days': 0, '>90 Days': 0 }
      let ipCounts = { v4: 0, v6: 0 }

      assets.forEach(a => {
        // Use HEI_Score mapping matching the Posture of PQC page
        const hei = a.HEI_Score || 50
        if (hei < 20)      riskCounts.Elite++
        else if (hei < 50) riskCounts.Standard++
        else if (hei < 80) riskCounts.Legacy++
        else               { riskCounts.Critical++; highRisk++ }
        if (hei >= 50 && hei < 80) highRisk++ // Include Legacy in highRisk metric

        let certVal = a['Certificate Validity (Not Before/After)']
        if (certVal && certVal['Not After']) {
          let days = (new Date(certVal['Not After']) - new Date()) / (1000 * 60 * 60 * 24)
          if (days < 0)       { expiring++; }
          else if (days <= 30)  { expiring++; certCounts['0-30 Days']++ }
          else if (days <= 60)  { certCounts['30-60 Days']++ }
          else if (days <= 90)  { certCounts['60-90 Days']++ }
          else                  { certCounts['>90 Days']++ }
        }

        const ip = a['IP Address'] || ''
        if (ip && ip !== '—') {
          if (ip.includes(':')) ipCounts.v6++
          else ipCounts.v4++
        }
      })

      // Also count IPs from subdomains
      subs.forEach(s => {
        ;(s.ips || []).forEach(ip => {
          if (ip.includes(':')) ipCounts.v6++; else ipCounts.v4++
        })
      })

      const totalIPs = ipCounts.v4 + ipCounts.v6 || 1
      const v4Pct = Math.round((ipCounts.v4 / totalIPs) * 100)

      // Asset type distribution chart — use summary if available, else derive
      let assetTypeDistChart
      if (Object.keys(atDist).length > 0) {
        assetTypeDistChart = Object.entries(atDist)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ name: fmtAssetType(k), value: v, color: assetTypeColor(k), key: k }))
      } else {
        // Fallback: derive from records
        const counts = {}
        assets.forEach(a => {
          const t = a['Asset Type'] || 'unknown'
          counts[t] = (counts[t] || 0) + 1
        })
        assetTypeDistChart = Object.entries(counts)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ name: fmtAssetType(k), value: v, color: assetTypeColor(k), key: k }))
      }

      return {
        success: true,
        statCards: [
          { label: 'Total Assets', value: totalUniqueAssets, icon: 'Layers', color: '#1d4ed8', bg: 'bg-blue-50' },
          { label: 'Web Applications', value: webApps, icon: 'Globe', color: '#16a34a', bg: 'bg-green-50' },
          { label: 'APIs Detected', value: apis, icon: 'Server', color: '#6366f1', bg: 'bg-purple-50' },
          { label: 'CDN / Proxy', value: cdns || infraSum.cdn_detected || 0, icon: 'Server', color: '#ec4899', bg: 'bg-pink-50' },
          { label: 'Expiring Certs', value: expiring, icon: 'AlertTriangle', color: '#d97706', bg: 'bg-amber-50', alert: true },
          { label: 'High Risk Assets', value: highRisk, icon: 'ShieldOff', color: '#dc2626', bg: 'bg-red-50', critical: true },
        ],
        assetTypeDist: assetTypeDistChart,
        riskDist: Object.entries(riskCounts).map(([k, v]) => ({ name: k, count: v })),
        certExpiry: [
          { label: '0–30 Days', count: certCounts['0-30 Days'], color: '#dc2626' },
          { label: '30–60 Days', count: certCounts['30-60 Days'], color: '#f59e0b' },
          { label: '60–90 Days', count: certCounts['60-90 Days'], color: '#22c55e' },
          { label: '>90 Days', count: certCounts['>90 Days'], color: '#3b82f6' },
        ],
        ipBreakdown: [
          { name: `IPv4 ${v4Pct}%`, value: v4Pct, color: '#1d4ed8' },
          { name: `IPv6 ${100 - v4Pct}%`, value: 100 - v4Pct, color: '#60a5fa' },
        ],
        infraSummary: {
          cdnDetected:  infraSum.cdn_detected  || 0,
          wafDetected:  infraSum.waf_detected   || 0,
          loadBalanced: infraSum.load_balanced  || 0,
        },
        cipherStrengthDist: cipherStrDist,
        subnetSummary: Object.entries(subnetSum)
          .slice(0, 10)
          .map(([subnet, count]) => ({ subnet, count })),
      }
    } catch (error) {
      console.error('getDashboardData error:', error)
      return { success: false, error: error.message }
    }
  },

  // Asset Discovery Data
  getAssetDiscoveryData: async () => {
    try {
      const [cbomRaw, subRaw] = await Promise.all([
        loadJSONData('PNB/enriched_cbom.json'),
        loadJSONData('PNB/subdomains.json')
      ])

      const allRecords = Array.isArray(cbomRaw) ? cbomRaw : cbomRaw?.records || []
      const { subdomains: subs } = normalizeSubdomainsData(subRaw)

      let domains = [], ssls = [], ipsArr = [], software = [], apisList = []

      // ── Domains from subdomains.json ───────────────────────────────────
      const seenFqdns = new Set()
      subs.forEach(s => {
        if (!seenFqdns.has(s.fqdn)) {
          seenFqdns.add(s.fqdn)
          domains.push({
            detected: s.resolved_at_utc || null,
            domain: s.fqdn,
            registered: '-', registrar: '-',
            company: 'PNB'
          })
        }
        ;(s.ips || []).forEach(ip => {
          ipsArr.push({
            detected: s.resolved_at_utc || null,
            ip,
            ipVersion: getIpVersionLabel(ip),
            ports: '-',
            subnet: '-',
            asn: '-',
            netname: '-',
            location: '-',
            company: 'PNB'
          })
        })
      })

      // Deduplicate IPs; enrich with subnet from Network Details
      const seenIPs = new Set()
      const seenAssets = new Set()
      allRecords.forEach(a => {
        const ip = a['IP Address']
        const nd = a['Network Details'] || {}
        const sd = a['SSL Details'] || {}
        const apiD = a['API Details'] || {}
        const infra = a['Infrastructure'] || {}

        // ── SSL: use real SSL Details values ──────────────────────────────
        let certVal = a['Certificate Validity (Not Before/After)']
        if (a['Issuer CA'] && !seenAssets.has(a.Asset)) {
          seenAssets.add(a.Asset)
          const sans = (sd.sans || []).slice(0, 3).join(', ') || '-'
          const evLabel = sd.is_ev ? '✓ EV' : '-'
          const wildcard = sd.is_wildcard ? '✓' : '-'
          ssls.push({
            detected: a['Scan Status'] === 'ok' ? new Date().toLocaleDateString() : '-',
            sha: (a['Hash Algorithm'] || '').substring(0, 30),
            validFrom: certVal?.['Not Before'] || '-',
            validTo:   certVal?.['Not After']  || '-',
            daysLeft:  sd.days_until_expiry !== null && sd.days_until_expiry !== undefined
                         ? sd.days_until_expiry
                         : null,
            cipherStrength: sd.cipher_strength || '-',
            common:    a['Subject CN'] || a.Asset,
            sans,
            isEV:      sd.is_ev || false,
            isWildcard: sd.is_wildcard || false,
            ctLogged:  sd.ct_logged || false,
            company:   'PNB',
            authority: (a['Issuer CA'] || '').replace('CN=', '').substring(0, 20),
            protocol:  sd.protocol_version || a['TLS Version'] || '-',
          })
        }

        // ── IP/Subnet: enrich with network details ─────────────────────────
        if (ip && ip !== '—' && !seenIPs.has(ip)) {
          seenIPs.add(ip)
          ipsArr.push({
            detected: null,
            ip,
            ipVersion: getIpVersionLabel(ip),
            ports: String(a.Port || '-'),
            subnet: nd.ip_subnet || '-',
            serviceType: nd.service_type || '-',
            portCategory: nd.port_category || '-',
            asset: a.Asset || ip,
            assetType: a['Asset Type'] || 'ip_address',
            asn: '-', netname: '-', location: '-', company: 'PNB'
          })
        }

        // ── Software from Technology Hints / Web Server ───────────────────
        const sv = a['Software Versions'] || []
        sv.forEach(version => {
          software.push({
            detected: '-',
            product: version.split('/')[0] || version,
            version: version.split('/')[1] || '-',
            type: nd.port_category || 'Web',
            port: a.Port,
            host: a.Asset,
            company: 'PNB'
          })
        })
        if (sv.length === 0 && a['Web Server']) {
          const ws = a['Web Server']
          const m = ws.match(/^([^/]+)(?:\/([^\s]+))?/)
          software.push({
            detected: '-',
            product: m?.[1] || ws,
            version: m?.[2] || '-',
            type:  nd.port_category || 'Web',
            port:  a.Port,
            host:  a.Asset,
            company: 'PNB'
          })
        }

        // ── APIs: from Asset Type = "api" ─────────────────────────────────
        if (a['Asset Type'] === 'api' || apiD.is_api) {
          apisList.push({
            detected: '-',
            host: a.Asset,
            ip: ip || '-',
            port: a.Port,
            apiType: apiD.api_type || 'REST',
            rateLimited: apiD.rate_limited ? '✓' : '—',
            versioned: apiD.versioned ? '✓' : '—',
            indicators: (apiD.indicators || []).join(', ') || '-',
            cdnProvider: infra.cdn_provider || '-',
            waf: infra.waf_detected ? '✓' : '—',
            company: 'PNB',
          })
        }
      })

      // Deduplicate software
      const seenSw = new Set()
      const dedupedSw = software.filter(s => {
        const k = `${s.product}:${s.host}`
        if (seenSw.has(k)) return false
        seenSw.add(k)
        return true
      })

      return {
        success: true,
        domainData: {
          New: domains.slice(0, 5),
          'False Positive': [],
          Confirmed: domains.slice(5),
          All: domains
        },
        sslData: {
          New: ssls.slice(0, 5),
          'False/ignore': [],
          Confirmed: ssls.slice(5),
          All: ssls
        },
        ipData: {
          New: ipsArr.slice(0, 10),
          'False or ignore': [],
          Confirmed: ipsArr.slice(10),
          All: ipsArr
        },
        softwareData: {
          New: dedupedSw.slice(0, 10),
          'False or ignore': [],
          Confirmed: dedupedSw.slice(10),
          All: dedupedSw
        },
        apiData: {
          New: apisList.slice(0, 5),
          'False or ignore': [],
          Confirmed: apisList.slice(5),
          All: apisList
        },
      }
    } catch (error) {
      console.error('getAssetDiscoveryData error:', error)
      return { success: false, error: error.message }
    }
  },

  // Asset data
  getAssets: async (limit = 100) => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load assets')

      const assets = dedupeByDomain(data.records || [])
        .slice(0, limit).map(normalizeAsset)
      return {
        success: true,
        assets,
        total: data.count_records || assets.length,
      }
    } catch (error) {
      console.error('getAssets error:', error)
      return {
        success: false,
        error: error.message,
        assets: [],
        total: 0,
      }
    }
  },

  // Enriched CBOM records — full list for inventory page
  getEnrichedAssets: async (limit = 5000) => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load enriched CBOM')
      const assets = (data.records || []).slice(0, limit).map(normalizeAsset)
      return { success: true, assets, summary: data._PQC_Enrichment_Summary || {} }
    } catch (error) {
      console.error('getEnrichedAssets error:', error)
      return { success: false, assets: [], summary: {} }
    }
  },

  // Subdomain discovery
  getSubdomains: async (limit = 100) => {
    try {
      const raw = await loadJSONData('PNB/subdomains.json')
      if (!raw) throw new Error('Failed to load subdomains')

      const { subdomains: allSubs, count_assets } = normalizeSubdomainsData(raw)
      const subdomains = allSubs.slice(0, limit).map(normalizeSubdomain)
      return {
        success: true,
        subdomains,
        total: count_assets,
      }
    } catch (error) {
      console.error('getSubdomains error:', error)
      return {
        success: false,
        error: error.message,
        subdomains: [],
        total: 0,
      }
    }
  },

  // CBOM - same as assets
  getCBOM: async () => {
    return dataAPI.getAssets(100)
  },

  // Shadow crypto findings
  getShadowCrypto: async () => {
    try {
      const data = await loadJSONData('PNB/shadow-crypto.json')
      if (!data) throw new Error('Failed to load shadow crypto data')

      const findings = (data.findings || []).map(normalizeFinding)
      return {
        success: true,
        findings,
        total: data.total_findings || findings.length,
        summary: data.severity_summary || {},
      }
    } catch (error) {
      console.error('getShadowCrypto error:', error)
      return {
        success: false,
        error: error.message,
        findings: [],
        total: 0,
        summary: {},
      }
    }
  },

  // CBOM Specific Data for Visuals — now includes asset type + cipher strength
  getCBOMData: async () => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load CBOM data')
      const summary = data._PQC_Enrichment_Summary || {}
      // Dedupe by domain — one canonical record per unique asset name
      const records = dedupeByDomain(data.records || [])

      const cipherCounts = {}
      const caCounts = {}
      const tlsCounts = {}
      const keyLenCounts = {}

      const appTable = records.map(r => {
        const cipher = r['Cipher Suite'] || 'Unknown'
        const ca = (r['Issuer CA'] || 'Other').replace(/^.*CN=/, '').split(',')[0].trim()
        const tls = r['TLS Version'] || 'Unknown'
        const kl = String(r['Key Size (Bits)'] || 2048)
        const assetType = r['Asset Type'] || 'unknown'
        const infra = r['Infrastructure'] || {}
        const apiD = r['API Details'] || {}
        const sslD = r['SSL Details'] || {}

        cipherCounts[cipher] = (cipherCounts[cipher] || 0) + 1
        if (ca.toLowerCase() !== 'localhost') {
          caCounts[ca] = (caCounts[ca] || 0) + 1
        }
        tlsCounts[tls] = (tlsCounts[tls] || 0) + 1
        keyLenCounts[kl] = (keyLenCounts[kl] || 0) + 1

        return {
          app: r.Asset || 'Unknown',
          assetType,
          assetTypeLabel: fmtAssetType(assetType),
          assetTypeColor: assetTypeColor(assetType),
          keyLen: `${kl}-Bit`,
          cipher,
          ca: ca.substring(0, 18),
          weak: Number(kl) < 2048 || tls.includes('1.0') || tls.includes('1.1') || cipher.includes('DES'),
          cipherStrength: sslD.cipher_strength || 'Unknown',
          isEV: sslD.is_ev || false,
          isWildcard: sslD.is_wildcard || false,
          daysLeft: sslD.days_until_expiry,
          cdnProvider: infra.cdn_provider || null,
          waf: infra.waf_detected || false,
          isApi: apiD.is_api || false,
          apiType: apiD.api_type || null,
          sans: (sslD.sans || []).slice(0, 2),
        }
      })

      const colors = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed']
      const toChartData = (counts, limit = 5, nameKey = 'name', valKey = 'count') =>
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([k, v], i) => ({
            [nameKey]: k,
            [valKey]: v,
            color: colors[i % colors.length]
          }))

      const totalApps = appTable.length
      const weakCrypto = appTable.filter(a => a.weak).length

      // Use summary asset_type_distribution if available
      const atDist = summary.asset_type_distribution || {}
      const assetTypePie = Object.keys(atDist).length > 0
        ? Object.entries(atDist)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ name: fmtAssetType(k), value: v, color: assetTypeColor(k) }))
        : []

      // Cipher strength distribution from summary
      const cipherStrDist = summary.cipher_strength_distribution || {}
      const cipherStrengthChart = Object.entries(cipherStrDist)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: k, value: v,
          color: k === 'Strong' ? '#16a34a' : k === 'Moderate' ? '#f59e0b' : k === 'Weak' ? '#dc2626' : '#94a3b8'
        }))

      // Infrastructure summary
      const infraSum = summary.infrastructure_summary || {}

      // Build exactly the 3 requested segments in strict order: Others, Geotrust G2, The R3 Provider
      let g2Count = 0; let g2Name = 'GeoTrust EV RSA CA G2';
      let r3Count = 0; let r3Name = 'GlobalSign RSA CA R3';
      let othersCount = 0;

      Object.entries(caCounts).forEach(([k, v]) => {
        const lowerK = k.toLowerCase();
        // Catch GeoTrust G2 variations
        if (lowerK.includes('geotrust') && (lowerK.includes('g2') || lowerK.includes('ev'))) {
          g2Count += v;
          if (v > 0) g2Name = k; // Extract exactly their full name from the data mapping
        } 
        // Catch the R3 variation (User requested Geotrust R3, but typically it is GlobalSign RSA CA R3 or Let's Encrypt R3)
        else if (lowerK.includes('r3') || (lowerK.includes('geotrust') && lowerK.includes('r3'))) {
          r3Count += v;
          if (v > 0) r3Name = k; // Extract exactly their full name from the data mapping
        } 
        // Everything else falls into Others
        else {
          othersCount += v;
        }
      });

      const rawCaData = [
        { name: 'Others', value: othersCount, color: colors[3] },
        { name: g2Name, value: g2Count, color: colors[1] },
        { name: r3Name, value: r3Count, color: colors[2] }
      ];
      
      const maxCaCount = rawCaData.reduce((max, d) => Math.max(max, d.value), 1);
      const normalizedCaData = rawCaData.map(d => ({ ...d, pct: Math.round((d.value / maxCaCount) * 100) }));

      return {
        success: true,
        cipherData: toChartData(cipherCounts, 5),
        caData: normalizedCaData,
        tlsData: toChartData(tlsCounts, 3, 'name', 'value'),
        keyLengthDist: toChartData(keyLenCounts, 6, 'len', 'count'),
        appTable: appTable,
        assetTypePie,
        cipherStrengthChart,
        infraSummary: infraSum,
        stats: {
          totalApps,
          sitesSurveyed: totalApps,
          activeCerts: totalApps,
          weakCrypto,
          certIssues: Math.round(weakCrypto * 0.3),
          evCerts:    appTable.filter(a => a.isEV).length,
          wildcardCerts: appTable.filter(a => a.isWildcard).length,
          cdnAssets:  infraSum.cdn_detected || appTable.filter(a => a.cdnProvider).length,
          wafAssets:  infraSum.waf_detected || appTable.filter(a => a.waf).length,
          apiAssets:  atDist.api || appTable.filter(a => a.isApi).length,
        }
      }
    } catch (error) {
      console.error('getCBOMData error:', error)
      return { success: false, error: error.message }
    }
  },

  // Cyber Rating
  getCyberRatingData: async () => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load cyber rating')

      const records = dedupeByDomain(data.records || [])
      let sum = 0

      const urlScores = records.map(r => {
        const hei = r.HEI_Score || 50
        const score = Math.max(0, 1000 - (hei * 10))
        sum += score
        const tier = score >= 701 ? 'Elite' : score >= 400 ? 'Standard' : score >= 200 ? 'Legacy' : 'Critical'
        return {
          url: r.Asset || 'Unknown',
          score,
          tier,
          assetType: r['Asset Type'] || 'unknown',
          assetTypeLabel: fmtAssetType(r['Asset Type'] || 'unknown'),
          cdnProvider: r['Infrastructure']?.cdn_provider || null,
          isApi: r['API Details']?.is_api || false,
        }
      })

      const enterpriseScore = records.length ? Math.round(sum / records.length) : 755
      const enterpriseTier = enterpriseScore >= 701 ? 'Elite-PQC' : enterpriseScore >= 400 ? 'Standard' : 'Legacy'

      return {
        success: true,
        enterpriseScore,
        enterpriseTier,
        urlScores: urlScores.sort((a, b) => b.score - a.score)
      }
    } catch (error) {
      console.error('getCyberRatingData error:', error)
      return { success: false, error: error.message }
    }
  },

  // PQC Posture
  getPostureOfPQCData: async () => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load PQC data')

      const records = dedupeByDomain(data.records || [])

      let elite = 0, std = 0, legacy = 0, critical = 0
      let pqcReadyApp = 0, stdApp = 0, legacyApp = 0, critApp = 0

      const assets = records.map(r => {
        const hei = r.HEI_Score || 50
        const isPQC = (r['NIST PQC Readiness Label']?.includes('PQC')) || hei < 20

        if (hei < 20) elite++
        else if (hei < 50) std++
        else if (hei < 80) legacy++
        else critical++

        if (isPQC) pqcReadyApp++
        else if (hei < 50) stdApp++
        else if (hei < 80) legacyApp++
        else critApp++

        return {
          name: r.Asset || 'Unknown',
          ip: r['IP Address'] || '-',
          pqc: isPQC,
          assetType: r['Asset Type'] || 'unknown',
          assetTypeLabel: fmtAssetType(r['Asset Type'] || 'unknown'),
          port: r.Port || 443,
          hei: hei,
          risk: r.Risk_Category || 'Unknown',
          pqcLabel: r['NIST PQC Readiness Label'] || (isPQC ? 'PQC Ready' : 'Needs Migration'),
          tls: r['TLS Version'] || '-',
          cipherStrength: (r['SSL Details'] || {}).cipher_strength || 'Unknown',
          certDaysLeft: (r['SSL Details'] || {}).days_until_expiry ?? null,
          webServer: r['Web Server'] || '-',
          issuer: r['Issuer CA'] || '-',
          pageTitle: r['Page Title'] || '-',
          scoringConfidence: r['Scoring_Confidence'] || '-',
          isApi: (r['API Details'] || {}).is_api || false,
          cdnProvider: (r['Infrastructure'] || {}).cdn_provider || null,
        }
      })

      const total = records.length || 1

      return {
        success: true,
        gradeData: [
          { name: 'Elite', value: elite, color: '#16a34a' },
          { name: 'Critical', value: critical, color: '#dc2626' },
          { name: 'Std', value: std, color: '#d97706' },
        ],
        appStatusData: [
          { name: 'Elite-PQC Ready', value: pqcReadyApp, color: '#16a34a' },
          { name: 'Standard', value: stdApp, color: '#d97706' },
          { name: 'Legacy', value: legacyApp, color: '#dc2626' },
          { name: 'Critical', value: critApp, color: '#7c0000' },
        ],
        assets: assets,
        summary: {
          pqcReadyPct: Math.round((pqcReadyApp / total) * 100),
          pqcReadyCount: pqcReadyApp,
          stdPct: Math.round((stdApp / total) * 100),
          stdCount: stdApp,
          legacyPct: Math.round((legacyApp / total) * 100),
          legacyCount: legacyApp,
          criticalCount: critApp
        }
      }
    } catch (error) {
      console.error('getPostureOfPQCData error:', error)
      return { success: false, error: error.message }
    }
  },

  // Business Impact
  getBusinessImpact: async () => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load business impact')

      const records = dedupeByDomain(data.records || [])
      const sorted = [...records].sort((a, b) => (b.HEI_Score || 0) - (a.HEI_Score || 0)).slice(0, 6)

      const assets = sorted.map(r => {
        const id = (r.Asset || '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || ('asset' + Math.random())
        const tls = r['TLS Version'] || 'TLSv1.2'
        const keyBits = parseInt(r['Key Size (Bits)']) || 2048
        const pfs = r['PFS Status'] === 'Yes'
        const hei = r.HEI_Score || 50

        return {
          id,
          name: r.Asset || 'Unknown',
          tls, keyBits, pfs, hei,
          assetType: r['Asset Type'] || 'unknown',
          value: Math.floor(Math.random() * 50_000_000) + 5_000_000,
          shelf: Math.floor(Math.random() * 8) + 3,
          blast: {
            direct: [`${id}_db`, `${id}_auth`],
            indirect: [`${id}_internal_api`, `${id}_cache`],
            cascading: [`${id}_analytics`, `${id}_audit_log`]
          }
        }
      })

      return { success: true, assets }
    } catch (error) {
      console.error('getBusinessImpact error:', error)
      return { success: false, error: error.message, assets: [] }
    }
  },

  // Homepage extras: DNS Records + Crypto/Security Overview
  getHomepageExtras: async () => {
    try {
      const data = await loadJSONData('PNB/enriched_cbom.json')
      if (!data) throw new Error('Failed to load CBOM data')

      const records = data.records || []

      // ── DNS Records ────────────────────────────────────────────────────────
      const seenIPs = new Set()
      const dnsRecords = []
      for (const r of records) {
        const ip = r['IP Address']
        if (!ip || ip === '—' || seenIPs.has(ip)) continue
        seenIPs.add(ip)
        const port = r.Port
        const isIPv6 = ip.includes(':')
        const type = isIPv6 ? 'AAAA' : port === 443 || port === 80 ? 'A' : 'A'
        const ttl = port === 443 || port === 80 ? '300' : '3600'
        const nd = r['Network Details'] || {}
        dnsRecords.push({
          hostname: r.Asset || '-',
          type,
          ip,
          ipVersion: getIpVersionLabel(ip),
          ttl,
          subnet: nd.ip_subnet || '-',
          assetType: r['Asset Type'] || 'unknown',
        })
        if (dnsRecords.length >= 8) break
      }

      // ── Crypto / Security Overview ─────────────────────────────────────────
      const validRecords = records.filter(r => {
        const type = r['Asset Type'];
        const cipher = r['Cipher Suite'];
        const tls = r['TLS Version'];
        const sslD = r['SSL Details'] || {};
        const cipherStrength = sslD.cipher_strength;
        const daysLeft = sslD.days_until_expiry;
        const keyBits = r['Key Size (Bits)'];
        
        const isUnknown = (val) => !val || val === '—' || val.toString().toLowerCase() === 'unknown';
        
        // Filter out any record that has an unknown field we want to display
        if (isUnknown(type)) return false;
        if (isUnknown(cipher)) return false;
        if (isUnknown(tls)) return false;
        if (isUnknown(cipherStrength)) return false;
        if (daysLeft === null || daysLeft === undefined) return false;
        if (!keyBits) return false;
        
        return true;
      });

      const sorted = [...validRecords]
        .sort((a, b) => (b.HEI_Score || 0) - (a.HEI_Score || 0))
        .slice(0, 6)

      const cryptoOverview = sorted.map(r => {
        const keyBits = r['Key Size (Bits)']
        const cipher = r['Cipher Suite']
        const tls = r['TLS Version']
        const qrmm = r.QRMM_Level?.label || 'Classical Insecure'
        const sslD = r['SSL Details'] || {}
        const infra = r['Infrastructure'] || {}
        const apiD = r['API Details'] || {}

        return {
          asset: r.Asset || 'Unknown',
          assetType: r['Asset Type'] || 'unknown',
          assetTypeLabel: fmtAssetType(r['Asset Type'] || 'unknown'),
          keyLen: keyBits ? `${keyBits}-bit` : 'N/A',
          cipher: cipher || qrmm,
          cipherIsWeak: !cipher || qrmm.includes('Insecure') || qrmm.includes('Classical'),
          cipherStrength: sslD.cipher_strength || 'Unknown',
          tls: tls ? tls.replace('TLSv', '') : 'None',
          tlsColor: !tls ? 'text-red-600' : tls.includes('1.3') ? 'text-green-600' : tls.includes('1.2') ? 'text-amber-600' : 'text-red-600',
          risk: r.Risk_Category || 'Critical',
          isEV: sslD.is_ev || false,
          cdnProvider: infra.cdn_provider || null,
          waf: infra.waf_detected || false,
          isApi: apiD.is_api || false,
          apiType: apiD.api_type || null,
          daysLeft: sslD.days_until_expiry,
        }
      })

      return { success: true, dnsRecords, cryptoOverview }
    } catch (error) {
      console.error('getHomepageExtras error:', error)
      return { success: false, error: error.message, dnsRecords: [], cryptoOverview: [] }
    }
  },
  // Quantum Drift data — fetches from the drift API endpoints
  getQuantumDriftData: async () => {
    try {
      const summaryRes = await fetch(`${DATA_API_BASE}/drift/summary`)
      if (!summaryRes.ok) throw new Error(`HTTP ${summaryRes.status}`)
      const summaryData = await summaryRes.json()

      const driftRes = await fetch(`${DATA_API_BASE}/drift?limit=50`)
      if (!driftRes.ok) throw new Error(`HTTP ${driftRes.status}`)
      const driftData = await driftRes.json()

      return {
        success: true,
        summary: summaryData,
        records: driftData.records || [],
        totalRecords: driftData.total_records || 0,
      }
    } catch (error) {
      console.error('getQuantumDriftData error:', error)
      return {
        success: false,
        error: error.message,
        summary: { total_drift_events: 0, by_severity: {}, by_type: {}, assets_affected: 0, recent: [] },
        records: [],
        totalRecords: 0,
      }
    }
  },
}

export default dataAPI
