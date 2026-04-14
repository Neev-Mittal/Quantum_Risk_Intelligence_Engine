import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { CheckCircle, XCircle, ShieldAlert, KeyRound, Wrench, FileText, Server, AlertTriangle, ShieldCheck, Activity, Cpu, GitCompareArrows, ArrowUpRight, ArrowDownRight, Minus, Clock, Shield, TrendingUp, TrendingDown } from 'lucide-react'
import dataAPI from '../dataAPI'

const recommendations = [
  { icon: 'TLS', text: 'Upgrade to TLS 1.3 with PQC', priority: 'High' },
  { icon: 'KEM', text: 'Implement Kyber for key exchange pilots', priority: 'High' },
  { icon: 'LIB', text: 'Update cryptographic libraries', priority: 'Medium' },
  { icon: 'PLAN', text: 'Publish a formal PQC migration plan', priority: 'Medium' },
]

const recIcons = {
  TLS: <ShieldAlert size={16} />,
  KEM: <KeyRound size={16} />,
  LIB: <Wrench size={16} />,
  PLAN: <FileText size={16} />,
}

function riskTextClass(risk) {
  if (risk === 'Critical') return 'text-red-600'
  if (risk === 'Legacy') return 'text-orange-600'
  if (risk === 'Standard') return 'text-amber-600'
  return 'text-green-600'
}

function daysLeftLabel(days) {
  if (days === null || days === undefined) return 'Not available'
  if (days < 0) return `Expired ${Math.abs(days)} days ago`
  return `${days} days remaining`
}

// ── Drift helpers ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  high:     { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  low:      { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  info:     { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
}

const DRIFT_TYPE_LABELS = {
  tls_downgrade: 'TLS Downgrade',
  tls_upgrade: 'TLS Upgrade',
  cipher_weakened: 'Cipher Weakened',
  cipher_strengthened: 'Cipher Strengthened',
  cipher_change: 'Cipher Change',
  key_size_decreased: 'Key Size Decreased',
  key_size_increased: 'Key Size Increased',
  key_size_change: 'Key Size Change',
  pfs_disabled: 'PFS Disabled',
  pfs_enabled: 'PFS Enabled',
  pqc_regression: 'PQC Regression',
  pqc_improvement: 'PQC Improvement',
  ca_change: 'CA Change',
  sig_algo_change: 'Signature Algorithm Change',
  scan_degraded: 'Scan Degraded',
  scan_recovered: 'Scan Recovered',
  risk_escalation: 'Risk Escalation',
  risk_reduction: 'Risk Reduction',
  field_change: 'Field Change',
}

const DRIFT_TYPE_COLORS = {
  tls_downgrade: '#dc2626',
  tls_upgrade: '#16a34a',
  cipher_weakened: '#ea580c',
  cipher_strengthened: '#16a34a',
  cipher_change: '#d97706',
  key_size_decreased: '#dc2626',
  key_size_increased: '#16a34a',
  pfs_disabled: '#ea580c',
  pfs_enabled: '#16a34a',
  pqc_regression: '#dc2626',
  pqc_improvement: '#16a34a',
  ca_change: '#6366f1',
  sig_algo_change: '#6366f1',
  scan_degraded: '#dc2626',
  scan_recovered: '#16a34a',
  risk_escalation: '#dc2626',
  risk_reduction: '#16a34a',
  field_change: '#94a3b8',
}

function formatDriftType(type) {
  return DRIFT_TYPE_LABELS[type] || type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown'
}

function getSeverityConfig(severity) {
  return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low
}

// Human-readable labels for DB column names used as field_name in drift records
const FIELD_NAME_LABELS = {
  active_tls_version: 'TLS Version',
  cipher_suite: 'Cipher Suite',
  key_exchange: 'Key Exchange',
  key_size: 'Key Size',
  pfs_enabled: 'Perfect Forward Secrecy',
  pqc_readiness: 'PQC Readiness',
  issuer_ca: 'Certificate Authority',
  signature_algo: 'Signature Algorithm',
  scan_status: 'Scan Status',
}

function formatFieldName(raw) {
  return FIELD_NAME_LABELS[raw] || raw?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown Field'
}

/**
 * Generate a human-readable sentence describing a drift event.
 * e.g. "mail.pnb.bank.in downgraded from TLS 1.2 to TLS 1.1"
 */
function describeDriftEvent(record) {
  const asset = record.asset_fqdn || record.asset_id?.substring(0, 16) || 'Unknown asset'
  const field = formatFieldName(record.field_name)
  const oldVal = record.old_value || 'unknown'
  const newVal = record.new_value || 'unknown'
  const type = record.drift_type

  switch (type) {
    case 'tls_downgrade':
      return `${asset} downgraded from ${oldVal} to ${newVal}`
    case 'tls_upgrade':
      return `${asset} upgraded from ${oldVal} to ${newVal}`
    case 'cipher_weakened':
      return `${asset} cipher weakened — now using ${newVal}`
    case 'cipher_strengthened':
      return `${asset} cipher strengthened — now using ${newVal}`
    case 'cipher_change':
      return `${asset} cipher suite changed to ${newVal}`
    case 'key_size_decreased':
      return `${asset} key size reduced from ${oldVal}-bit to ${newVal}-bit`
    case 'key_size_increased':
      return `${asset} key size increased from ${oldVal}-bit to ${newVal}-bit`
    case 'key_size_change':
      return `${asset} key size changed from ${oldVal} to ${newVal}`
    case 'pfs_disabled':
      return `${asset} lost Perfect Forward Secrecy protection`
    case 'pfs_enabled':
      return `${asset} gained Perfect Forward Secrecy protection`
    case 'pqc_regression':
      return `${asset} PQC readiness regressed from ${oldVal} to ${newVal}`
    case 'pqc_improvement':
      return `${asset} PQC readiness improved from ${oldVal} to ${newVal}`
    case 'ca_change':
      return `${asset} certificate authority changed to ${newVal}`
    case 'sig_algo_change':
      return `${asset} signature algorithm changed to ${newVal}`
    case 'scan_degraded':
      return `${asset} is no longer responding to scans`
    case 'scan_recovered':
      return `${asset} is responding to scans again`
    case 'risk_escalation':
      return `${asset} risk level escalated`
    case 'risk_reduction':
      return `${asset} risk level improved`
    default:
      return `${asset} — ${field} changed from ${oldVal} to ${newVal}`
  }
}

function formatTimestamp(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function HeiDeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return null
  const isWorse = delta > 0
  const isNeutral = delta === 0
  const Icon = isWorse ? ArrowUpRight : isNeutral ? Minus : ArrowDownRight
  const color = isWorse ? 'text-red-600' : isNeutral ? 'text-slate-400' : 'text-emerald-600'
  const bg = isWorse ? 'bg-red-50' : isNeutral ? 'bg-slate-50' : 'bg-emerald-50'
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${color} ${bg}`}>
      <Icon size={10} />
      {isWorse ? '+' : ''}{delta.toFixed(1)}
    </span>
  )
}


// ── Quantum Drift Section Component ─────────────────────────────────────────

function QuantumDriftSection() {
  const [driftData, setDriftData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllRecords, setShowAllRecords] = useState(false)

  useEffect(() => {
    dataAPI.getQuantumDriftData().then((res) => {
      setDriftData(res)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 border border-indigo-100/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <GitCompareArrows className="text-indigo-600" size={16} />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-800">Quantum Drift Tracking</h2>
            <p className="text-[11px] text-slate-400">Loading drift data...</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const summary = driftData?.summary || {}
  const records = driftData?.records || []
  const totalEvents = summary.total_drift_events || 0
  const assetsAffected = summary.assets_affected || 0
  const bySeverity = summary.by_severity || {}
  const byType = summary.by_type || {}

  // Prepare type distribution chart data
  const typeChartData = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, count]) => ({
      name: formatDriftType(type),
      value: count,
      color: DRIFT_TYPE_COLORS[type] || '#94a3b8',
    }))

  const visibleRecords = showAllRecords ? records : records.slice(0, 6)

  // Empty state
  if (totalEvents === 0) {
    return (
      <div className="glass-card rounded-xl p-6 border border-indigo-100/50 shadow-sm shadow-indigo-900/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <GitCompareArrows className="text-white" size={16} />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-800">Quantum Drift Tracking</h2>
            <p className="text-[11px] text-slate-400">Cryptographic posture change detection across scans</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-indigo-200/60 bg-indigo-50/30">
          <Shield className="mb-3 text-indigo-300" size={36} />
          <p className="font-display text-sm font-semibold text-slate-600">No Drift Detected</p>
          <p className="mt-1 text-[11px] text-slate-400 text-center max-w-xs">
            Cryptographic posture has remained stable. Drift records will appear here when changes are detected between scans.
          </p>
        </div>
      </div>
    )
  }

  // Count critical+high for the alert badge
  const criticalHighCount = (bySeverity.critical || 0) + (bySeverity.high || 0)

  return (
    <div className="glass-card rounded-xl border border-indigo-100/50 shadow-sm shadow-indigo-900/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-100/50 bg-gradient-to-r from-indigo-50/80 to-violet-50/40 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
            <GitCompareArrows className="text-white" size={16} />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-800">Quantum Drift Tracking</h2>
            <p className="text-[11px] text-slate-400">Cryptographic posture changes across scans</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {criticalHighCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
              <AlertTriangle className="text-red-500" size={12} />
              <span className="font-display text-[10px] font-bold text-red-700">
                {criticalHighCount} Critical/High
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1">
            <Activity className="text-indigo-500" size={12} />
            <span className="font-display text-[10px] font-bold text-indigo-700">
              {totalEvents} Events
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-3">
            <p className="font-display text-[10px] uppercase tracking-wider text-indigo-400">Total Events</p>
            <p className="mt-1 font-mono text-xl font-bold text-indigo-700">{totalEvents}</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-3">
            <p className="font-display text-[10px] uppercase tracking-wider text-violet-400">Assets Affected</p>
            <p className="mt-1 font-mono text-xl font-bold text-violet-700">{assetsAffected}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/50 to-white p-3">
            <p className="font-display text-[10px] uppercase tracking-wider text-red-400">Critical</p>
            <p className="mt-1 font-mono text-xl font-bold text-red-600">{bySeverity.critical || 0}</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50/50 to-white p-3">
            <p className="font-display text-[10px] uppercase tracking-wider text-orange-400">High</p>
            <p className="mt-1 font-mono text-xl font-bold text-orange-600">{bySeverity.high || 0}</p>
          </div>
        </div>

        {/* Two Columns: Type Distribution + Severity Breakdown */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Drift Type Distribution */}
          {typeChartData.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white/60 p-4">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
                Drift Type Distribution
              </h3>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={120} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
                      {typeChartData.map((entry, index) => (
                        <Cell key={`drift-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Severity Breakdown */}
          <div className="rounded-xl border border-slate-100 bg-white/60 p-4">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
              Severity Breakdown
            </h3>
            <div className="space-y-2.5">
              {['critical', 'high', 'medium', 'low', 'info'].map((sev) => {
                const count = bySeverity[sev] || 0
                if (count === 0 && totalEvents > 0) return null
                const pct = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0
                const config = getSeverityConfig(sev)
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <div className="w-16">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${config.badge}`}>
                        {sev}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(2, pct)}%`,
                            backgroundColor: SEVERITY_CONFIG[sev]?.dot?.replace('bg-', '') || '#94a3b8',
                            background: sev === 'critical' ? '#dc2626' : sev === 'high' ? '#f97316' : sev === 'medium' ? '#d97706' : sev === 'low' ? '#3b82f6' : '#10b981',
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] font-bold text-slate-600">{count}</span>
                  </div>
                )
              }).filter(Boolean)}
            </div>
          </div>
        </div>

        {/* Recent Drift Events Timeline */}
        <div className="rounded-xl border border-slate-100 bg-white/60 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-slate-400" />
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
                Recent Drift Events
              </h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              {records.length} of {totalEvents}
            </span>
          </div>

          <div className="max-h-[380px] overflow-y-auto subtle-scrollbar">
            {visibleRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Shield size={24} className="mb-2 text-slate-200" />
                <p className="text-xs text-slate-400">No drift events recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {visibleRecords.map((record, idx) => {
                  const config = getSeverityConfig(record.severity)
                  const isNegative = ['tls_downgrade', 'cipher_weakened', 'key_size_decreased', 'pfs_disabled', 'pqc_regression', 'scan_degraded', 'risk_escalation'].includes(record.drift_type)
                  const isPositive = ['tls_upgrade', 'cipher_strengthened', 'key_size_increased', 'pfs_enabled', 'pqc_improvement', 'scan_recovered', 'risk_reduction'].includes(record.drift_type)
                  const DirIcon = isNegative ? TrendingDown : isPositive ? TrendingUp : Minus
                  const dirColor = isNegative ? 'text-red-500' : isPositive ? 'text-emerald-500' : 'text-slate-400'

                  return (
                    <div key={record.id || idx} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 ${idx === 0 ? '' : ''}`}>
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center pt-1">
                        <div className={`h-2.5 w-2.5 rounded-full ${config.dot} ring-2 ring-white shadow-sm`} />
                        {idx < visibleRecords.length - 1 && (
                          <div className="mt-1 w-px flex-1 bg-slate-100" style={{ minHeight: 20 }} />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Severity badge + drift type + direction + HEI delta */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${config.badge}`}>
                            {record.severity}
                          </span>
                          <span className="font-display text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                            {formatDriftType(record.drift_type)}
                          </span>
                          <DirIcon size={13} className={dirColor} />
                          {record.hei_delta !== null && record.hei_delta !== undefined && (
                            <HeiDeltaBadge delta={record.hei_delta} />
                          )}
                        </div>

                        {/* Row 2: Human-readable description */}
                        <p className="mt-1 text-[12px] leading-5 text-slate-700">
                          {describeDriftEvent(record)}
                        </p>

                        {/* Row 3: Field label + value change badges */}
                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] flex-wrap">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-display text-[10px] font-semibold text-slate-500">
                            {formatFieldName(record.field_name)}
                          </span>
                          {record.old_value && (
                            <span className="inline-block rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600 line-through max-w-[160px] truncate" title={record.old_value}>
                              {record.old_value}
                            </span>
                          )}
                          {record.old_value && record.new_value && (
                            <span className="text-slate-300">→</span>
                          )}
                          {record.new_value && (
                            <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700 max-w-[160px] truncate" title={record.new_value}>
                              {record.new_value}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timestamp + risk category change */}
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[10px] text-slate-400">{formatTimestamp(record.scan_timestamp)}</p>
                        {record.old_risk_category && record.new_risk_category && record.old_risk_category !== record.new_risk_category && (
                          <p className="mt-0.5 text-[9px] text-slate-400">
                            <span className={riskTextClass(record.old_risk_category)}>{record.old_risk_category}</span>
                            {' → '}
                            <span className={riskTextClass(record.new_risk_category)}>{record.new_risk_category}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Show more / less toggle */}
          {records.length > 6 && (
            <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-2 text-center">
              <button
                onClick={() => setShowAllRecords(!showAllRecords)}
                className="font-display text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {showAllRecords ? 'Show Less' : `Show All ${records.length} Events`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Main Component ──────────────────────────────────────────────────────────

export default function PostureOfPQC() {
  const [data, setData] = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)

  useEffect(() => {
    dataAPI.getPostureOfPQCData().then((res) => {
      if (res.success) {
        setData(res)
        setSelectedAsset(res.assets?.[0] || null)
      }
    })
  }, [])

  if (!data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-amber-200/60 bg-amber-50/50 p-8 text-center glass-card">
        <Cpu className="mb-4 text-pnb-amber" size={32} />
        <h2 className="font-display text-lg font-bold text-pnb-crimson">
          Aggregating PQC Intelligence...
        </h2>
      </div>
    )
  }

  const { gradeData, appStatusData, assets, summary } = data

  return (
    <div className="space-y-5">
      
      {/* Header Section */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson">PQC Compliance Dashboard</h1>
          <p className="mt-0.5 font-body text-sm text-slate-500">Post-Quantum Cryptography readiness and cryptographic transition modeling.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
            <ShieldCheck className="text-emerald-600" size={14} />
            <span className="font-display text-xs font-bold text-emerald-900">Elite-PQC Ready</span>
            <span className="font-mono text-xs font-bold text-emerald-700">{summary.pqcReadyCount}</span>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <Activity className="text-amber-600" size={14} />
            <span className="font-display text-xs font-bold text-amber-900">Standard</span>
            <span className="font-mono text-xs font-bold text-amber-700">{summary.stdCount}</span>
          </div>

          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
            <AlertTriangle className="text-orange-600" size={14} />
            <span className="font-display text-xs font-bold text-orange-900">Legacy</span>
            <span className="font-mono text-xs font-bold text-orange-700">{summary.legacyCount}</span>
          </div>

          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <Server className="text-red-600" size={14} />
            <span className="font-display text-xs font-bold text-red-900">Critical Apps</span>
            <span className="font-mono text-xs font-bold text-red-700">{summary.criticalCount}</span>
          </div>
        </div>
      </div>

      {/* Row 1: Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        
        {/* Bar Chart */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between hidden-scroll">
          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
              Assets by Grade
            </h3>
          </div>
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} barSize={24} isAnimationActive={false}>
                  {gradeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
              Application Status
            </h3>
          </div>
          
          <div className="relative mt-1 flex-1">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={appStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35} isAnimationActive={false}>
                  {appStatusData.map((item, index) => <Cell key={index} fill={item.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-2 grid grid-cols-2 gap-2">
            {appStatusData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
                  <span className="font-body text-[10px] text-gray-600 line-clamp-1 truncate">{name}</span>
                </div>
                <span className="font-mono text-[10px] font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Readiness Bars */}
        <div className="glass-card rounded-xl p-4 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-1">
            Migration Readiness
          </h3>
          <p className="text-[11px] text-slate-400 mb-4">Progress towards PQC isolation.</p>
          <div className="flex flex-1 flex-col justify-evenly">
            {[
              { label: 'Secure and PQC Ready', items: ['Elite-PQC Ready'], color: '#10b981' },
              { label: 'Moderate / Transition', items: ['Standard'], color: '#f59e0b' },
              { label: 'High Risk / Vulnerable', items: ['Legacy', 'Critical'], color: '#ef4444' },
            ].map((group) => {
              const count = appStatusData
                .filter((item) => group.items.includes(item.name))
                .reduce((sum, item) => sum + item.value, 0)
              const total = appStatusData.reduce((sum, item) => sum + item.value, 0) || 1
              const pct = Math.round((count / total) * 100)

              return (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex items-end justify-between">
                    <span className="font-display text-[11px] text-slate-700">
                      {group.label}
                    </span>
                    <span className="font-mono text-xs font-bold" style={{ color: group.color }}>
                      {count} <span className="font-sans text-[10px] text-slate-400 ml-0.5">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full" 
                      style={{ 
                        width: `${Math.max(1, pct)}%`, 
                        background: group.color,
                      }} 
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Quantum Drift */}
      <QuantumDriftSection />

      {/* Row 3 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        
        {/* Table */}
        <div className="glass-card rounded-xl overflow-hidden col-span-1 border border-amber-100/50 shadow-sm shadow-amber-900/5">
          <div className="flex items-center justify-between border-b border-amber-100/50 bg-white/40 px-4 py-3">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
              Asset Inventory
            </h3>
            <span className="text-[10px] font-bold text-slate-500">
              {assets.length} Selected
            </span>
          </div>
          
          <div className="max-h-[350px] overflow-y-auto subtle-scrollbar w-full">
            <table className="w-full text-left font-body text-xs">
              <thead className="sticky top-0 z-10 bg-amber-50">
                <tr>
                  <th className="px-4 py-2 font-display font-semibold text-pnb-crimson">Hostname / IP</th>
                  <th className="px-4 py-2 text-center font-display font-semibold text-pnb-crimson">PQC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((asset, index) => {
                  const isSelected = selectedAsset?.name === asset.name
                  return (
                    <tr
                      key={`${asset.name}-${asset.ip}-${index}`}
                      onClick={() => setSelectedAsset(asset)}
                      className={`cursor-pointer ${
                        isSelected
                          ? 'bg-amber-100/60'
                          : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <p className={`font-semibold ${isSelected ? 'text-pnb-crimson' : 'text-slate-700'}`}>{asset.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{asset.ip}:{asset.port}</p>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {asset.pqc ? <CheckCircle size={14} className="mx-auto text-green-500" /> : <XCircle size={14} className="mx-auto text-red-500" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Asset Details */}
        <div className="glass-card col-span-1 rounded-xl p-4 flex flex-col border border-amber-100/50 shadow-sm shadow-amber-900/5">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-4">
            Asset Deep Dive
          </h3>

          {selectedAsset ? (
            <div className="flex flex-col flex-1">
              <div className="mb-4 flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pnb-crimson font-display text-sm font-bold text-white">
                  {selectedAsset.name?.charAt(0)?.toUpperCase() || 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-slate-800">{selectedAsset.name}</p>
                  <p className="truncate font-mono text-[10px] text-slate-500">{selectedAsset.ip}:{selectedAsset.port}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pb-2">
                {[
                  { label: 'Type', value: selectedAsset.assetTypeLabel },
                  { label: 'TLS', value: selectedAsset.tls },
                  { label: 'Risk', value: selectedAsset.risk, className: riskTextClass(selectedAsset.risk) },
                  { label: 'Cert', value: daysLeftLabel(selectedAsset.certDaysLeft) },
                  { label: 'Issuer', value: selectedAsset.issuer },
                  { label: 'Server', value: selectedAsset.webServer },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <p className="font-display text-[10px] uppercase text-slate-400">{item.label}</p>
                    <p className={`truncate font-display text-xs font-bold ${item.className || 'text-slate-700'}`}>
                      {item.value || '-'}
                    </p>
                  </div>
                ))}
                
                <div className="col-span-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                  <p className="font-display text-[10px] uppercase text-slate-400">Cipher Protocol</p>
                  <p className="truncate font-mono text-[11px] font-semibold text-slate-600">
                    {selectedAsset.cipherStrength || 'Unknown Algorithm'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
             <div className="mt-6 flex h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <Server size={24} className="mb-2 text-slate-300" />
              <p className="font-body text-xs text-slate-400">Select an asset from the inventory</p>
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="glass-card col-span-1 rounded-xl p-4 flex flex-col border border-amber-100/50 shadow-sm shadow-amber-900/5">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-4">
            Priority Actions
          </h3>
          
          <div className="space-y-2 flex-1">
            {recommendations.map((recommendation, idx) => {
              const IconData = recIcons[recommendation.icon] || <CheckCircle size={14} />
              const isHigh = recommendation.priority === 'High'
              
              return (
                <div
                  key={`rec-${idx}`}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    isHigh 
                      ? 'border-red-100 bg-red-50' 
                      : 'border-amber-100 bg-amber-50'
                  }`}
                >
                  <div className={`mt-0.5 ${isHigh ? 'text-red-500' : 'text-amber-500'}`}>
                    {IconData}
                  </div>
                  <div>
                    <p className="font-display text-xs font-semibold text-slate-700">{recommendation.text}</p>
                    <p className={`font-display text-[10px] font-bold mt-0.5 ${isHigh ? 'text-red-600' : 'text-amber-600'}`}>
                      {recommendation.priority} Priority
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
