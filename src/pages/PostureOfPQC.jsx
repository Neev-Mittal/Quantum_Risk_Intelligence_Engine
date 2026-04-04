import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { CheckCircle, XCircle, ShieldAlert, KeyRound, Wrench, FileText, Server, AlertTriangle, ShieldCheck, Activity, Cpu } from 'lucide-react'
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
  PLAN: <FileText size={16} />
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

      {/* Row 2 */}
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
