/**
 * QRIE API Client
 * Centralized API wrapper for all backend calls
 */

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Response normalization helpers
const normalizeAsset = (asset) => ({
  id: asset['Asset ID'],
  name: asset.Asset,
  url: `https://${asset.Asset}`,
  ip: asset['IP Address'],
  port: asset.Port,
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
  heiScore: asset.HEI_Score,
  riskCategory: asset.Risk_Category,
  pqcLabel: asset['NIST PQC Readiness Label'],
})

const normalizeSubdomain = (sub) => ({
  fqdn: sub.fqdn,
  ips: sub.ips || [],
  status: sub.status,
  type: sub.asset_type,
  sources: sub.sources || [],
  resolvedAt: sub.resolved_at_utc,
})

const normalizeShadowFinding = (finding) => ({
  type: finding.finding_type,
  severity: finding.severity,
  asset: finding.asset,
  ip: finding.ip_address,
  port: finding.port,
  description: finding.description,
  recommendation: finding.recommendation,
  details: finding.details,
})

const normalizeSimulation = (sim) => ({
  asset: sim.Asset,
  hei: sim.HEI,
  sensitivity: sim.Sensitivity,
  scenarios: {
    aggressive: sim.Scenarios?.Aggressive,
    moderate: sim.Scenarios?.Moderate,
    conservative: sim.Scenarios?.Conservative,
  },
  blastRadius: sim.Blast_Radius,
})

// ─────────────────────────────────────────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────────────────────────────────────────

export const api = {
  // ─── Asset Inventory ─────────────────────────────────────────────────────
  getAssets: async (limit = 50) => {
    try {
      const res = await fetch(`${BASE}/api/assets?limit=${limit}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return {
        success: true,
        assets: (data.records || []).map(normalizeAsset),
        total: data.count_records || 0,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        assets: [],
        total: 0,
      }
    }
  },

  // ─── Asset Discovery ────────────────────────────────────────────────────
  getSubdomains: async (limit = 100) => {
    try {
      const res = await fetch(`${BASE}/api/subdomains?limit=${limit}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return {
        success: true,
        subdomains: (data.subdomains || []).map(normalizeSubdomain),
        total: data.count_assets || 0,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        subdomains: [],
        total: 0,
      }
    }
  },

  // ─── CBOM ───────────────────────────────────────────────────────────────
  getCBOM: async () => {
    try {
      const res = await fetch(`${BASE}/api/cbom`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      // Aggregate stats from assets
      const assets = (data.records || []).map(normalizeAsset)
      const stats = {
        totalApplications: assets.length,
        siteSurveyed: assets.length,
        activeCertificates: assets.filter(a => a.notAfter).length,
        weakCrypto: assets.filter(a => a.keyBits < 2048).length,
        certificateIssues: assets.filter(a => {
          const expiry = new Date(a.notAfter)
          const now = new Date()
          const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24)
          return daysLeft < 90
        }).length,
      }

      return {
        success: true,
        assets,
        stats,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        assets: [],
        stats: { totalApplications: 0, siteSurveyed: 0, activeCertificates: 0, weakCrypto: 0, certificateIssues: 0 },
      }
    }
  },

  // ─── Shadow Crypto (Security Findings) ──────────────────────────────────
  getShadowCrypto: async () => {
    try {
      const res = await fetch(`${BASE}/api/shadow-crypto`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      return {
        success: true,
        findings: (data.findings || []).map(normalizeShadowFinding),
        total: data.total_findings || 0,
        summary: data.severity_summary || {},
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        findings: [],
        total: 0,
        summary: {},
      }
    }
  },

  // ─── PQC Posture ───────────────────────────────────────────────────────
  getPostureOfPQC: async () => {
    try {
      const res = await fetch(`${BASE}/api/pqc-posture`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      const assets = (data.records || []).map(normalizeAsset)
      const pqcReady = assets.filter(a => a.pqcLabel === 'PQC-Ready').length
      const notReady = assets.length - pqcReady

      return {
        success: true,
        assets,
        pqcReady,
        notReady,
        total: assets.length,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        assets: [],
        pqcReady: 0,
        notReady: 0,
        total: 0,
      }
    }
  },

  // ─── Cyber Rating ──────────────────────────────────────────────────────
  getCyberRating: async () => {
    try {
      const res = await fetch(`${BASE}/api/cyber-rating`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      const assets = (data.records || []).map(normalizeAsset)
      
      // Calculate score (0-1000)
      const avgHei = assets.length > 0 
        ? assets.reduce((sum, a) => sum + (a.heiScore || 0), 0) / assets.length
        : 0
      const score = Math.round(avgHei * 10)
      
      return {
        success: true,
        assets,
        score,
        tier: score >= 701 ? 'Elite' : score >= 400 ? 'Standard' : score >= 200 ? 'Legacy' : 'Critical',
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        assets: [],
        score: 0,
        tier: 'Unknown',
      }
    }
  },

  // ─── Business Impact / QVaR Simulation ─────────────────────────────────
  getBusinessImpact: async () => {
    try {
      const res = await fetch(`${BASE}/api/business-impact`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      
      return {
        success: true,
        simulations: (data || []).map(normalizeSimulation),
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        simulations: [],
      }
    }
  },

  // ─── Health Check ──────────────────────────────────────────────────────
  health: async () => {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { success: true, status: data.status }
    } catch (error) {
      return { success: false, error: error.message, status: 'offline' }
    }
  },
}

export default api
