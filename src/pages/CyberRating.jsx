import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import dataAPI from '../dataAPI'

const tiers = [
  {
    tier: 'Tier-1 Elite',
    level: 'Modern best-practise crypto posture',
    criteria: 'TLS 1.2 / TLS 1.3 only; Strong Ciphers (AES-GCM / ChaCha20); Forward Secrecy (ECDHE); certificate >2048-bit (prefer 3072/4096); no weak protocols; no known vulnerabilities; HSTS enabled',
    action: 'Maintain Configuration; periodic monitoring; recommended baseline for public-facing apps',
    color: 'bg-green-50 border-green-300',
    badge: 'tier-elite',
    icon: CheckCircle,
    iconColor: 'text-green-600',
  },
  {
    tier: 'Tier-2 Standard',
    level: 'Acceptable enterprise configuration',
    criteria: 'TLS 1.2 supported but legacy protocols allowed; Key >2048-bit; Mostly strong ciphers but backward compatibility allowed; Forward secrecy optional',
    action: 'Improve gradually; disable legacy protocols; standardise cipher suites.',
    color: 'bg-amber-50 border-amber-300',
    badge: 'tier-standard',
    icon: AlertCircle,
    iconColor: 'text-amber-600',
  },
  {
    tier: 'Tier-3 Legacy',
    level: 'Weak but still operational',
    criteria: 'TLS 1.0 / TLS 1.1 enabled; weak ciphers (CBC, 3DES); Forward secrecy missing; Key possibly 1024-bit',
    action: 'Remediation required; upgrade TLS stack; rotate certificates; remove weak cipher suites',
    color: 'bg-orange-50 border-orange-300',
    badge: 'tier-legacy',
    icon: AlertCircle,
    iconColor: 'text-orange-600',
  },
  {
    tier: 'Critical',
    level: 'Insecure / exploitable',
    criteria: 'SSL v2 / SSL v3 enabled; Key <1024-bit; weak cipher suites (<112-bit security) Known vulnerabilities',
    action: 'Immediate action — block or isolate service; replace certificate and TLS configuration; patch vulnerabilities',
    color: 'bg-red-50 border-red-400',
    badge: 'tier-critical',
    icon: XCircle,
    iconColor: 'text-red-700',
  },
]

// urlScores dynamically loaded from PNB

const tierMeta = {
  Legacy:   { min: 0,   max: 399,  color: '#dc2626', bg: 'bg-red-100' },
  Standard: { min: 400, max: 700,  color: '#d97706', bg: 'bg-amber-100' },
  Elite:    { min: 701, max: 1000, color: '#16a34a', bg: 'bg-green-100' },
  Critical: { min: 0,   max: 100,  color: '#7c0000', bg: 'bg-red-200' },
}

function ScoreGauge({ score }) {
  const pct = score / 10
  const color = score >= 701 ? '#16a34a' : score >= 400 ? '#d97706' : score >= 200 ? '#dc2626' : '#7c0000'
  const label = score >= 701 ? 'Elite-PQC' : score >= 400 ? 'Standard' : score >= 200 ? 'Legacy' : 'Critical'

  return (
    <div className="relative w-48 h-24 mx-auto">
      <svg viewBox="0 0 200 110" className="w-full">
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
        {/* Score arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${pct * 2.51} ${251 - pct * 2.51}`}
        />
        {/* Center text */}
        <text x="100" y="80" textAnchor="middle" fill={color} fontFamily="Oxanium" fontWeight="800" fontSize="28">
          {score}
        </text>
        <text x="100" y="100" textAnchor="middle" fill="#6b7280" fontFamily="DM Sans" fontSize="10">
          / 1000
        </text>
      </svg>
    </div>
  )
}

export default function CyberRating() {
  const [data, setData] = useState(null)

  useEffect(() => {
    dataAPI.getCyberRatingData().then(res => {
      if (res.success) setData(res)
    })
  }, [])

  if (!data) {
    return <div className="p-8 flex items-center justify-center min-h-[400px] text-pnb-crimson font-display font-semibold tracking-wide bg-amber-50/50 rounded-2xl border border-amber-200">Loading Enterprise Cyber Rating...</div>
  }

  const { enterpriseScore, enterpriseTier, urlScores } = data;

  return (
    <div className="space-y-5">
      {/* Header */}
      <h1 className="font-display text-xl font-bold text-pnb-crimson">Cyber Rating</h1>

      {/* Enterprise Score card */}
      <div className="glass-card rounded-2xl p-6 max-w-2xl mx-auto text-center shadow-xl">
        <h2 className="font-display text-sm font-semibold text-gray-500 uppercase tracking-widest mb-1">
          Consolidated Enterprise-Level Cyber-Rating Score
        </h2>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div>
            <ScoreGauge score={enterpriseScore} />
          </div>
          <div className="text-left">
            <div className={`text-white font-display font-bold text-4xl px-6 py-3 rounded-xl mb-2
              ${enterpriseTier === 'Elite-PQC' ? 'bg-green-500' : enterpriseTier === 'Standard' ? 'bg-amber-500' : 'bg-red-600'}`}>
              {enterpriseScore}/1000
            </div>
            <p className={`font-display text-sm font-bold ${enterpriseTier === 'Elite-PQC' ? 'text-green-600' : enterpriseTier === 'Standard' ? 'text-amber-600' : 'text-red-700'}`}>
              {enterpriseTier}
            </p>
            <p className="font-body text-xs text-gray-500">Indicates a stronger security posture</p>
          </div>
        </div>
      </div>

      {/* Rating scale table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-100">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
            PQC Rating Scale
          </h3>
        </div>
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="bg-amber-50">
              {['Status','PQC Rating For Enterprise'].map(h => (
                <th key={h} className="px-5 py-3 text-left font-display font-semibold text-pnb-crimson text-xs tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { icon:'🔴', label:'Legacy',   range:'< 400',     color:'text-red-600'   },
              { icon:'🔶', label:'Standard', range:'400 till 700',color:'text-amber-600' },
              { icon:'✅', label:'Elite-PQC',range:'> 700',     color:'text-green-600' },
              { icon:'📊', label:'Maximum Score after normalisation*', range:'1000', color:'text-gray-700' },
            ].map((r, i) => (
              <tr key={i} className={`border-b border-amber-50 ${i%2===0?'bg-white/80':'bg-amber-50/30'}`}>
                <td className="px-5 py-3">
                  <span className="mr-2">{r.icon}</span>
                  <span className={`font-display font-bold ${r.color}`}>{r.label}</span>
                </td>
                <td className={`px-5 py-3 font-display font-bold text-xl ${r.color}`}>{r.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-URL scores */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-100">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
            Per-URL PQC Scores
          </h3>
        </div>
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="bg-amber-50">
              {['URL','PQC Score','Tier','Score Bar'].map(h => (
                <th key={h} className="px-5 py-3 text-left font-display font-semibold text-pnb-crimson text-xs tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {urlScores.map((r, i) => {
              const meta = tierMeta[r.tier]
              return (
                <tr key={i} className={`border-b border-amber-50 ${i%2===0?'bg-white/80':'bg-amber-50/30'}`}>
                  <td className="px-5 py-3 font-display font-bold text-blue-700 text-base">{r.url}</td>
                  <td className="px-5 py-3 font-display font-bold text-2xl" style={{ color: meta.color }}>{r.score}</td>
                  <td className="px-5 py-3">
                    <span className={`font-display text-xs font-bold px-3 py-1 rounded-full text-white
                      ${r.tier === 'Elite' ? 'bg-green-500' : r.tier === 'Standard' ? 'bg-amber-500' : 'bg-red-600'}`}>
                      {r.tier}
                    </span>
                  </td>
                  <td className="px-5 py-3 w-48">
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${r.score}%`, background: meta.color }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Tier criteria cards */}
      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-pnb-crimson uppercase tracking-wide">
          Tier Classification Criteria
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {tiers.map((t) => {
            const Icon = t.icon
            return (
              <div key={t.tier} className={`glass-card rounded-xl p-4 border ${t.color}`}>
                <div className="flex items-start gap-3 mb-2">
                  <Icon size={18} className={t.iconColor} />
                  <div>
                    <p className="font-display font-bold text-sm text-gray-800">{t.tier}</p>
                    <p className={`font-body text-xs font-semibold ${t.iconColor}`}>{t.level}</p>
                  </div>
                </div>
                <p className="font-body text-xs text-gray-600 mb-2 leading-relaxed">{t.criteria}</p>
                <div className="bg-white/60 rounded-lg p-2">
                  <p className="font-display text-xs font-semibold text-gray-700">Priority / Action:</p>
                  <p className="font-body text-xs text-gray-600 mt-0.5">{t.action}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
