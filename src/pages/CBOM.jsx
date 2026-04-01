import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts'
import dataAPI from '../dataAPI'

const CIPHER_STRENGTH_COLORS = {
  Strong:   '#16a34a',
  Moderate: '#f59e0b',
  Weak:     '#dc2626',
  Unknown:  '#94a3b8',
}

function AssetTypeDot({ type }) {
  const colors = {
    web_application: '#3b82f6', api: '#6366f1', web_server: '#0ea5e9',
    database: '#f59e0b', mail_server: '#10b981', dns_server: '#8b5cf6',
    cdn_proxy: '#ec4899', load_balancer: '#f97316', ssl_certificate: '#14b8a6',
    unknown: '#94a3b8'
  }
  return <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5" style={{ background: colors[type] || '#94a3b8' }} />
}

export default function CBOM() {
  const [data, setData] = useState(null)

  useEffect(() => {
    dataAPI.getCBOMData().then(res => {
      if (res.success) setData(res)
    })
  }, [])

  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px] text-pnb-crimson font-display
                      font-semibold tracking-wide bg-amber-50/50 rounded-2xl border border-amber-200">
        Loading Cryptographic Bill of Materials...
      </div>
    )
  }

  const {
    cipherData, caData, tlsData, keyLengthDist, appTable, stats,
    assetTypePie, cipherStrengthChart, infraSummary
  } = data

  return (
    <div className="space-y-4">
      {/* Header */}
      <h1 className="font-display text-xl font-bold text-pnb-crimson">
        Cryptographic Bill of Materials (CBOM)
      </h1>

      {/* Stat strip — now includes EV, wildcard, CDN, WAF, API counts */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Applications',  value: stats.totalApps,    color: '#1d4ed8', bg: 'bg-blue-50'   },
          { label: 'Weak Cryptography',   value: stats.weakCrypto,   color: '#d97706', bg: 'bg-amber-50',  alert: true },
          { label: 'Certificate Issues',  value: stats.certIssues,   color: '#dc2626', bg: 'bg-red-50',    critical: true },
          { label: 'API Assets',          value: stats.apiAssets,    color: '#6366f1', bg: 'bg-indigo-50'  },
        ].map(({ label, value, color, bg, alert, critical }) => (
          <div key={label} className={`glass-card rounded-xl p-4 stat-card ${critical ? 'border-red-300' : alert ? 'border-amber-300' : 'border-amber-100'}`}>
            <p className="font-display text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="font-body text-xs text-gray-500 mt-0.5">{label}</p>
            {(alert || critical) && (
              <div className={`mt-1 h-1 rounded-full ${critical ? 'bg-red-500' : 'bg-amber-400'} badge-critical`} />
            )}
          </div>
        ))}
      </div>

      {/* Secondary stat row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'EV Certificates',   value: stats.evCerts,       color: '#16a34a', bg: 'bg-green-50' },
          { label: 'Wildcard Certs',    value: stats.wildcardCerts, color: '#0891b2', bg: 'bg-cyan-50'  },
          { label: 'CDN-Protected',     value: stats.cdnAssets,     color: '#3b82f6', bg: 'bg-blue-50'  },
          { label: 'WAF-Protected',     value: stats.wafAssets,     color: '#f59e0b', bg: 'bg-amber-50'  },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="glass-card rounded-xl p-3 border-amber-100">
            <p className="font-display text-xl font-bold" style={{ color }}>{value ?? '—'}</p>
            <p className="font-body text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4">

        {/* Key Length Distribution */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Key Length Distribution
          </h3>
          <div className="flex items-end gap-2 h-32">
            {(keyLengthDist || []).map(({ len, count, color }) => {
              const maxCount = Math.max(1, ...keyLengthDist.map(k => k.count))
              const heightPct = Math.round((count / maxCount) * 100)
              return (
                <div key={len} className="flex flex-col items-center flex-1 h-full justify-end">
                  <span className="font-mono text-xs font-bold mb-0.5" style={{ color }}>{count}</span>
                  <div className="w-full rounded-t transition-all"
                    style={{ height: `${heightPct}%`, background: color, minHeight: '4px' }} />
                  <span className="font-mono text-xs text-gray-500 mt-1 truncate w-full text-center">{len}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cipher Usage */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Cipher Suite Usage
          </h3>
          <div className="space-y-2">
            {cipherData.map(({ name, count, color }) => (
              <div key={name}>
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-xs text-gray-600 truncate max-w-48">{name}</span>
                  <span className="font-display font-bold text-xs ml-2" style={{ color }}>{count}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded overflow-hidden">
                  <div className="cipher-bar h-full"
                    style={{ width: `${(count / Math.max(1, ...cipherData.map(c => c.count))) * 100}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cipher Strength Distribution (new) */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Cipher Strength Breakdown
          </h3>
          {cipherStrengthChart && cipherStrengthChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={cipherStrengthChart} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                    {cipherStrengthChart.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {cipherStrengthChart.map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                      <span className="font-body text-gray-600">{name}</span>
                    </div>
                    <span className="font-display font-bold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400 font-body text-xs">
              Run a scan to populate cipher strength data
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4">

        {/* Asset Type Distribution (new) */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Asset Type Distribution
          </h3>
          {assetTypePie && assetTypePie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={assetTypePie} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                    {assetTypePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {assetTypePie.slice(0, 5).map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                      <span className="font-body text-gray-600 truncate max-w-24">{name}</span>
                    </div>
                    <span className="font-display font-bold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400 font-body text-xs">
              Run a scan to populate asset type data
            </div>
          )}
        </div>

        {/* Top Certificate Authorities */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Top Certificate Authorities
          </h3>
          <div className="space-y-2 mb-2">
            {caData.slice(0, 2).map(({ name, value, color }) => (
              <div key={name}>
                <div className="flex justify-between mb-0.5">
                  <span className="font-body text-xs text-gray-700 truncate max-w-36">{name}</span>
                  <span className="font-display font-bold text-xs" style={{ color }}>{value}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded overflow-hidden">
                  <div style={{ width: `${value}%`, background: color }} className="h-full rounded transition-all" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 mt-1">
            {caData.slice(2).map(({ name, color }) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                <span className="font-body text-xs text-gray-600 truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Encryption Protocols */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Encryption Protocols
          </h3>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={tlsData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                {tlsData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {tlsData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <span className="font-body text-gray-600">{name}</span>
                </div>
                <span className="font-display font-bold" style={{ color }}>{value}%</span>
              </div>
            ))}
          </div>
          {tlsData.some(d => d.name?.includes('1.1') || d.name?.includes('1.0')) && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-display text-xs text-red-700 font-semibold">⚠ Legacy TLS Detected</p>
              <p className="font-body text-xs text-red-500 mt-0.5">Immediate upgrade recommended</p>
            </div>
          )}
        </div>
      </div>

      {/* Infrastructure Summary (new) */}
      {(infraSummary && (infraSummary.cdn_detected || infraSummary.waf_detected || infraSummary.load_balanced)) && (
        <div className="glass-card rounded-xl p-4">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Infrastructure Protection Overview
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'CDN Protected Assets',    value: infraSummary.cdn_detected  || 0, color: '#3b82f6', icon: '☁', desc: 'Assets served via Content Delivery Networks' },
              { label: 'WAF Protected Assets',    value: infraSummary.waf_detected  || 0, color: '#f59e0b', icon: '🛡', desc: 'Assets with Web Application Firewall detected' },
              { label: 'Load Balanced Assets',    value: infraSummary.load_balanced || 0, color: '#6366f1', icon: '⚖', desc: 'Assets behind load balancers' },
            ].map(({ label, value, color, icon, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-2xl mt-0.5">{icon}</span>
                <div>
                  <p className="font-display text-2xl font-extrabold" style={{ color }}>{value}</p>
                  <p className="font-display text-xs font-semibold text-gray-700">{label}</p>
                  <p className="font-body text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Application table — now includes asset type + cipher strength + CDN/API badges */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
            CBOM Application Detail
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50">
                {['Application', 'Asset Type', 'Key Length', 'Cipher Str.', 'Cipher Suite', 'Certificate Authority', 'EV', 'Wildcard', 'CDN', 'WAF', 'API'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-pnb-crimson whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appTable.map((r, i) => (
                <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50/50 ${i % 2 === 0 ? 'bg-white/80' : 'bg-red-50/20'}`}>
                  <td className="px-3 py-2.5 font-semibold text-blue-700 max-w-36 truncate">{r.app}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center text-xs font-display font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${r.assetTypeColor}22`, color: r.assetTypeColor }}>
                      {r.assetTypeLabel}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 font-mono font-bold ${
                    r.keyLen.startsWith('4096') ? 'text-green-600' :
                    r.keyLen.startsWith('2048') ? 'text-blue-600'  :
                    r.keyLen.startsWith('1024') ? 'text-red-600'   : 'text-gray-400'
                  }`}>{r.keyLen}</td>
                  <td className="px-3 py-2.5">
                    <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                      r.cipherStrength === 'Strong'   ? 'bg-green-100 text-green-700' :
                      r.cipherStrength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                      r.cipherStrength === 'Weak'     ? 'bg-red-100   text-red-700'   :
                      'bg-gray-100 text-gray-400'
                    }`}>{r.cipherStrength}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${r.weak ? 'bg-red-100 text-red-700' : 'text-gray-700'}`}>
                      {r.cipher.substring(0, 26)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-28 truncate">{r.ca}</td>
                  <td className="px-3 py-2.5 text-center">{r.isEV ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-center">{r.isWildcard ? <span className="text-amber-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5">
                    {r.cdnProvider
                      ? <span className="bg-blue-100 text-blue-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">☁ {r.cdnProvider}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">{r.waf ? <span className="text-amber-600">🛡</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5">
                    {r.isApi
                      ? <span className="bg-indigo-100 text-indigo-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">{r.apiType || 'REST'}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
