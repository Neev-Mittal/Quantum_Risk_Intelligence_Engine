import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts'
import { Server, Key, AlertTriangle, Activity, Cloud, Shield, Network, Lock, Globe, Database, CheckCircle, Minus } from 'lucide-react'
import dataAPI from '../dataAPI'

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
                      font-semibold tracking-wide bg-amber-50/50 rounded-2xl border border-amber-200 glass-card">
        Loading Cryptographic Bill of Materials...
      </div>
    )
  }

  const {
    cipherData, caData, tlsData, keyLengthDist, appTable, stats,
    assetTypePie, cipherStrengthChart, infraSummary
  } = data

  return (
    <div className="space-y-5">
      {/* Header Section */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson">
            Cryptographic Bill of Materials (CBOM)
          </h1>
          <p className="mt-0.5 font-body text-sm text-slate-500">Comprehensive overview of cryptographic assets and vulnerabilities.</p>
        </div>

        {/* Small metric pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <Lock className="text-green-600" size={14} />
            <span className="font-display text-xs font-bold text-green-900">EV Certs</span>
            <span className="font-mono text-xs font-bold text-green-700">{stats.evCerts || 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-1.5">
            <Globe className="text-cyan-600" size={14} />
            <span className="font-display text-xs font-bold text-cyan-900">Wildcard</span>
            <span className="font-mono text-xs font-bold text-cyan-700">{stats.wildcardCerts || 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
            <Cloud className="text-blue-600" size={14} />
            <span className="font-display text-xs font-bold text-blue-900">CDN Protected</span>
            <span className="font-mono text-xs font-bold text-blue-700">{stats.cdnAssets || 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <Shield className="text-amber-600" size={14} />
            <span className="font-display text-xs font-bold text-amber-900">WAF Protected</span>
            <span className="font-mono text-xs font-bold text-amber-700">{stats.wafAssets || 0}</span>
          </div>
        </div>
      </div>

      {/* Main Stat row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Applications',  value: stats.totalApps,    color: '#1d4ed8', icon: Server   },
          { label: 'Weak Cryptography',   value: stats.weakCrypto,   color: '#d97706', alert: true, icon: Key },
          { label: 'Certificate Issues',  value: stats.certIssues,   color: '#dc2626', critical: true, icon: AlertTriangle },
          { label: 'API Assets',          value: stats.apiAssets,    color: '#6366f1', icon: Activity },
        ].map(({ label, value, color, alert, critical, icon: Icon }) => (
          <div key={label} className={`glass-card rounded-xl p-4 flex flex-col border border-amber-100/50 shadow-sm shadow-amber-900/5 ${critical ? 'bg-red-50/30 border-red-200' : alert ? 'bg-amber-50/30 border-amber-200' : 'bg-white/40'}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-2xl font-extrabold" style={{ color }}>{value}</p>
                <p className="font-display text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
              </div>
            </div>
            {(alert || critical) && (
              <div className="mt-3 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${critical ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4">
        {/* Key Length Distribution */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
            Key Length Distribution
          </h3>
          <div className="flex-1 w-full h-32 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={keyLengthDist} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <XAxis dataKey="len" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ fontSize: 11, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} barSize={20} isAnimationActive={false}>
                  {keyLengthDist?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cipher Usage */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
            Cipher Suite Usage
          </h3>
          <div className="space-y-2 mt-1">
            {cipherData.map(({ name, count, color }) => (
              <div key={name}>
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs text-slate-700 truncate max-w-[200px]" title={name}>{name}</span>
                  <span className="font-mono font-bold text-xs" style={{ color }}>{count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(count / Math.max(1, ...cipherData.map(c => c.count))) * 100}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cipher Strength Distribution */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-2">
            Cipher Strength Breakdown
          </h3>
          {cipherStrengthChart && cipherStrengthChart.length > 0 ? (
            <>
              <div className="flex-1 relative">
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={cipherStrengthChart} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={30} isAnimationActive={false}>
                      {cipherStrengthChart.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {cipherStrengthChart.map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
                      <span className="font-body text-[10px] text-slate-600 line-clamp-1 truncate">{name}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
             <div className="flex-1 flex items-center justify-center text-slate-400 font-body text-xs rounded-lg border border-dashed border-slate-200 bg-slate-50 mt-2">
               Run scan to map cipher strengths
             </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-3 gap-4">
        {/* Asset Type Distribution */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-2">
            Asset Type Distribution
          </h3>
          {assetTypePie && assetTypePie.length > 0 ? (
            <>
              <div className="flex-1 relative">
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={assetTypePie} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={30} isAnimationActive={false}>
                      {assetTypePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                {assetTypePie.slice(0, 4).map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
                      <span className="font-body text-[10px] text-slate-600 truncate max-w-[60px]">{name}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 font-body text-xs rounded-lg border border-dashed border-slate-200 bg-slate-50 mt-2">
               Run scan to discover asset types
            </div>
          )}
        </div>

        {/* Top Certificate Authorities */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
            Top Certificate Authorities
          </h3>
          <div className="space-y-3 flex-1 mt-1">
            {caData.slice(0, 3).map(({ name, value, pct, color }) => (
              <div key={name} className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <span className="font-body text-[11px] font-semibold text-slate-700 truncate">{name}</span>
                  <span className="font-mono font-bold text-xs" style={{ color }}>{value}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div style={{ width: `${pct || value}%`, background: color }} className="h-full rounded-full transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Encryption Protocols */}
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5 flex flex-col">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-2">
            Encryption Protocols
          </h3>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height={110}>
              <PieChart>
                <Pie data={tlsData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={30} isAnimationActive={false}>
                  {tlsData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
            {tlsData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm" style={{ background: color }} />
                  <span className="font-body text-[10px] text-slate-600 truncate max-w-[60px]">{name}</span>
                </div>
                <span className="font-mono text-[10px] font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
          {tlsData.some(d => d.name?.includes('1.1') || d.name?.includes('1.0')) && (
            <div className="mt-3 flex items-start gap-2 p-2 bg-red-50 border border-red-100 rounded-lg">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-display text-[10px] font-bold text-red-700">Legacy TLS Detected</p>
                <p className="font-body text-[9px] text-red-600 mt-0.5">Immediate upgrade recommended</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Infrastructure Summary */}
      {(infraSummary && (infraSummary.cdn_detected || infraSummary.waf_detected || infraSummary.load_balanced)) && (
        <div className="glass-card rounded-xl p-4 border border-amber-100/50 shadow-sm shadow-amber-900/5">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-3">
            Infrastructure Protection Overview
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'CDN Protected', value: infraSummary.cdn_detected || 0, color: '#3b82f6', icon: <Cloud size={20}/>, desc: 'Served via content networks' },
              { label: 'WAF Guarded', value: infraSummary.waf_detected || 0, color: '#f59e0b', icon: <Shield size={20}/>, desc: 'Behind app firewall' },
              { label: 'Load Balanced', value: infraSummary.load_balanced || 0, color: '#6366f1', icon: <Network size={20}/>, desc: 'Traffic routed via LB' },
            ].map(({ label, value, color, icon, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-100/80">
                <div className="p-2 rounded-lg bg-white shadow-sm border border-slate-100 mt-0.5 text-slate-500" style={{ color }}>{icon}</div>
                <div>
                  <p className="font-display text-xl font-extrabold" style={{ color }}>{value}</p>
                  <p className="font-display text-[11px] font-bold text-slate-700">{label}</p>
                  <p className="font-body text-[10px] text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Application Table (Modernized) */}
      <div className="glass-card rounded-xl overflow-hidden border border-amber-100/50 shadow-sm shadow-amber-900/5">
        <div className="flex items-center justify-between border-b border-amber-100/50 bg-white/40 px-4 py-3">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            CBOM Application Detail
          </h3>
          <span className="text-[10px] font-bold text-slate-500">{appTable?.length || 0} Assets</span>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto subtle-scrollbar w-full">
          <table className="w-full text-left font-body text-xs">
            <thead className="sticky top-0 z-10 bg-amber-50">
              <tr>
                {['Application', 'Type', 'Key Len', 'Strength', 'Cipher Suite', 'CA', 'EV', 'Wild', 'CDN', 'WAF', 'API'].map(h => (
                  <th key={h} className="px-4 py-3 font-display font-semibold text-pnb-crimson whitespace-nowrap text-[11px] uppercase tracking-wide shadow-[0_1px_0_rgba(251,191,36,0.2)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {appTable.map((r, i) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 max-w-36 truncate">{r.app}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center text-[10px] font-display font-bold px-2 py-0.5 rounded border"
                      style={{ backgroundColor: `${r.assetTypeColor}15`, color: r.assetTypeColor, borderColor: `${r.assetTypeColor}30` }}>
                      {r.assetTypeLabel}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-mono font-bold text-[10px] ${
                    r.keyLen.startsWith('4096') ? 'text-green-600' :
                    r.keyLen.startsWith('2048') ? 'text-blue-600'  :
                    r.keyLen.startsWith('1024') ? 'text-red-600'   : 'text-slate-400'
                  }`}>{r.keyLen}</td>
                  <td className="px-4 py-3">
                    <span className={`font-display text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.cipherStrength === 'Strong'   ? 'bg-green-100 text-green-700' :
                      r.cipherStrength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                      r.cipherStrength === 'Weak'     ? 'bg-red-100   text-red-700'   :
                      'bg-slate-100 text-slate-500'
                    }`}>{r.cipherStrength}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${r.weak ? 'bg-red-50 text-red-600 border border-red-100' : 'text-slate-600 bg-slate-50 border border-slate-100'}`}>
                      {r.cipher.substring(0, 24)}{r.cipher.length > 24 ? '...' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-medium text-[11px] max-w-28 truncate">{r.ca}</td>
                  <td className="px-4 py-3 text-center">{r.isEV ? <CheckCircle size={14} className="mx-auto text-green-500" /> : <Minus size={14} className="mx-auto text-slate-300" />}</td>
                  <td className="px-4 py-3 text-center">{r.isWildcard ? <CheckCircle size={14} className="mx-auto text-cyan-600" /> : <Minus size={14} className="mx-auto text-slate-300" />}</td>
                  <td className="px-4 py-3 text-center">
                    {r.cdnProvider
                      ? <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 font-display text-[10px] font-bold px-2 py-0.5 rounded border border-blue-100"><Cloud size={10} className="mr-1"/> CDN</span>
                      : <Minus size={14} className="mx-auto text-slate-300" />}
                  </td>
                  <td className="px-4 py-3 text-center">{r.waf ? <Shield size={14} className="mx-auto text-amber-500" /> : <Minus size={14} className="mx-auto text-slate-300" />}</td>
                  <td className="px-4 py-3 text-center">
                    {r.isApi
                      ? <span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-600 font-display text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100">{r.apiType || 'API'}</span>
                      : <Minus size={14} className="mx-auto text-slate-300" />}
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
