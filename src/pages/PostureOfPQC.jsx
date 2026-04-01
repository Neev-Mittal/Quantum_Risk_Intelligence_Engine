import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { CheckCircle, XCircle } from 'lucide-react'
import dataAPI from '../dataAPI'

const recommendations = [
  { icon: 'TLS', text: 'Upgrade to TLS 1.3 with PQC', priority: 'High' },
  { icon: 'KEM', text: 'Implement Kyber for key exchange pilots', priority: 'High' },
  { icon: 'LIB', text: 'Update cryptographic libraries', priority: 'Medium' },
  { icon: 'PLAN', text: 'Publish a formal PQC migration plan', priority: 'Medium' },
]

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
      <div className="min-h-[400px] rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center font-display font-semibold tracking-wide text-pnb-crimson">
        Loading PQC compliance data...
      </div>
    )
  }

  const { gradeData, appStatusData, assets, summary } = data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson">PQC Compliance Dashboard</h1>
          <p className="mt-0.5 font-body text-sm text-gray-600">Post-Quantum Cryptography readiness assessment</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-slate-800 px-5 py-3 font-display text-sm text-white">
          <span className="font-bold text-green-400">Elite-PQC Ready: <span className="text-white">{summary.pqcReadyPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="font-bold text-amber-400">Standard: <span className="text-white">{summary.stdPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="font-bold text-red-400">Legacy: <span className="text-white">{summary.legacyPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="font-bold text-red-300">Critical Apps: <span className="text-white">{summary.criticalCount}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card flex flex-col justify-between rounded-xl p-5">
          <h3 className="mb-4 font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Assets by Classification Grade
          </h3>

          <div className="flex flex-1 items-end gap-6 border-b border-amber-100/50 pb-0 pt-4 h-36">
            {gradeData.map((grade) => {
              const maxVal = Math.max(1, ...gradeData.map((item) => item.value))
              const pct = (grade.value / maxVal) * 100

              return (
                <div key={grade.name} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                  <span className="mb-1.5 font-display text-lg font-bold transition-transform group-hover:-translate-y-1" style={{ color: grade.color }}>
                    {grade.value}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t shadow-sm transition-all duration-700 group-hover:opacity-100"
                    style={{
                      height: `${Math.max(4, pct)}%`,
                      background: grade.color,
                      backgroundImage: `linear-gradient(to top, ${grade.color}99, ${grade.color})`,
                    }}
                  />
                  <p className="mt-2 text-[10px] font-display font-bold uppercase tracking-widest text-gray-500">{grade.name}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-5">
          <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Application Status
          </h3>
          <div className="relative flex-1">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={appStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {appStatusData.map((item, index) => <Cell key={index} fill={item.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {appStatusData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded shadow-sm" style={{ background: color }} />
                  <span className="font-body text-xs font-medium text-gray-600">{name}</span>
                </div>
                <span className="font-display text-xs font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-5">
          <h3 className="mb-4 font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Migration Readiness Overview
          </h3>
          <div className="mt-2 space-y-5">
            {[
              { label: 'Secure and PQC Ready', items: ['Elite-PQC Ready'], color: '#16a34a', marker: 'Good' },
              { label: 'Moderate / Transition', items: ['Standard'], color: '#f59e0b', marker: 'Watch' },
              { label: 'High Risk / Vulnerable', items: ['Legacy', 'Critical'], color: '#dc2626', marker: 'Risk' },
            ].map((group) => {
              const count = appStatusData
                .filter((item) => group.items.includes(item.name))
                .reduce((sum, item) => sum + item.value, 0)
              const total = appStatusData.reduce((sum, item) => sum + item.value, 0) || 1
              const pct = Math.round((count / total) * 100)

              return (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex items-end justify-between">
                    <span className="flex items-center gap-2 font-body text-xs font-medium text-gray-700">
                      <span className="rounded bg-white p-0.5 text-[10px] shadow-sm">{group.marker}</span>
                      {group.label}
                    </span>
                    <span className="font-display text-xs font-bold" style={{ color: group.color }}>
                      {count} <span className="font-normal opacity-50">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-100/50 shadow-inner">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: group.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card col-span-1 overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
              Assets PQC Support
            </h3>
            <p className="font-body text-[11px] text-gray-500">Click a row to inspect the asset</p>
          </div>
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50">
                <th className="px-4 py-2.5 text-left font-display font-semibold text-pnb-crimson">Asset</th>
                <th className="px-4 py-2.5 text-center font-display font-semibold text-pnb-crimson">PQC</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, index) => {
                const isSelected = selectedAsset?.name === asset.name

                return (
                  <tr
                    key={`${asset.name}-${asset.ip}-${index}`}
                    onClick={() => setSelectedAsset(asset)}
                    className={`cursor-pointer border-b border-amber-50 transition-colors ${
                      isSelected
                        ? 'bg-amber-100/80'
                        : index % 2 === 0
                        ? 'bg-white/80 hover:bg-amber-50/60'
                        : 'bg-red-50/10 hover:bg-amber-50/60'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-700">
                      <p className="font-medium text-slate-800">{asset.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">{asset.ip}:{asset.port}</p>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {asset.pqc ? (
                        <CheckCircle size={16} className="inline text-green-500" />
                      ) : (
                        <XCircle size={16} className="inline text-red-500" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="glass-card col-span-1 rounded-xl p-5">
          <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Improvement Recommendations
          </h3>
          <div className="space-y-2">
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.text}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  recommendation.priority === 'High' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <span className="text-base">{recommendation.icon}</span>
                <div>
                  <p className="font-body text-xs text-gray-700">{recommendation.text}</p>
                  <span className={`font-display text-xs font-bold ${recommendation.priority === 'High' ? 'text-red-600' : 'text-amber-600'}`}>
                    {recommendation.priority} Priority
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card col-span-1 rounded-xl p-5">
          <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Selected Asset Details
          </h3>

          {selectedAsset ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pnb-crimson text-xs font-display font-bold text-white">
                  {selectedAsset.name?.charAt(0)?.toUpperCase() || 'A'}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display font-bold text-gray-800">{selectedAsset.name}</p>
                  <p className="truncate font-mono text-xs text-gray-500">{selectedAsset.ip}:{selectedAsset.port}</p>
                </div>
              </div>

              {[
                { label: 'Asset Type', value: selectedAsset.assetTypeLabel },
                { label: 'TLS', value: selectedAsset.tls },
                { label: 'Cipher Strength', value: selectedAsset.cipherStrength },
                { label: 'Risk', value: selectedAsset.risk, className: riskTextClass(selectedAsset.risk) },
                { label: 'PQC Readiness', value: selectedAsset.pqcLabel, className: selectedAsset.pqc ? 'text-green-600' : 'text-amber-600' },
                { label: 'Certificate', value: daysLeftLabel(selectedAsset.certDaysLeft) },
                { label: 'Issuer', value: selectedAsset.issuer },
                { label: 'Web Server', value: selectedAsset.webServer },
                { label: 'Scoring Confidence', value: selectedAsset.scoringConfidence },
                { label: 'Page Title', value: selectedAsset.pageTitle },
                { label: 'API Exposure', value: selectedAsset.isApi ? 'API-facing asset' : selectedAsset.cdnProvider ? `Via ${selectedAsset.cdnProvider}` : 'Standard web exposure' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <p className="font-body text-xs text-gray-500">{item.label}</p>
                  <p className={`mt-1 break-words font-display text-xs font-bold ${item.className || 'text-gray-800'}`}>
                    {item.value || '-'}
                  </p>
                </div>
              ))}

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>HEI Score</span>
                  <span className={`font-display font-bold ${riskTextClass(selectedAsset.risk)}`}>{selectedAsset.hei}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${
                      selectedAsset.hei >= 80 ? 'bg-red-500' : selectedAsset.hei >= 50 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, selectedAsset.hei))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="font-body text-sm text-gray-500">Select an asset from the table to inspect its posture details.</p>
          )}
        </div>
      </div>
    </div>
  )
}
