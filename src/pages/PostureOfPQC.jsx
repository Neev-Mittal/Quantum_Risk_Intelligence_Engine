import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react'
import dataAPI from '../dataAPI'

// Assets and grades dynamically loaded from PNB

const recommendations = [
  { icon: '⚠', text: 'Upgrade to TLS 1.3 with PQC',       priority: 'High'   },
  { icon: '🔑', text: 'Implement Kyber for Key Exchange',  priority: 'High'   },
  { icon: '📚', text: 'Update Cryptographic Libraries',    priority: 'Medium' },
  { icon: '📋', text: 'Develop PQC Migration Plan',        priority: 'Medium' },
]

const riskHeatmap = [
  ['#dc2626','#dc2626','#d97706'],
  ['#d97706','#d97706','#16a34a'],
  ['#d97706','#16a34a','#16a34a'],
]

export default function PostureOfPQC() {
  const [data, setData] = useState(null)

  useEffect(() => {
    dataAPI.getPostureOfPQCData().then(res => {
      if (res.success) setData(res)
    })
  }, [])

  if (!data) {
    return <div className="p-8 flex items-center justify-center min-h-[400px] text-pnb-crimson font-display font-semibold tracking-wide bg-amber-50/50 rounded-2xl border border-amber-200">Loading PQC Compliance Data...</div>
  }

  const { gradeData, appStatusData, assets, summary } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson">PQC Compliance Dashboard</h1>
          <p className="font-body text-sm text-gray-600 mt-0.5">Post-Quantum Cryptography readiness assessment</p>
        </div>
        {/* Summary strip */}
        <div className="flex items-center gap-4 bg-slate-800 text-white rounded-xl px-5 py-3 font-display text-sm">
          <span className="text-green-400 font-bold">Elite-PQC Ready: <span className="text-white">{summary.pqcReadyPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="text-amber-400 font-bold">Standard: <span className="text-white">{summary.stdPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="text-red-400 font-bold">Legacy: <span className="text-white">{summary.legacyPct}%</span></span>
          <span className="text-amber-400">|</span>
          <span className="text-red-300 font-bold">Critical Apps: <span className="text-white">{summary.criticalCount}</span></span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-4">

        {/* Assets by Classification Grade */}
        <div className="glass-card rounded-xl p-5 flex flex-col justify-between">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-4">
            Assets by Classification Grade
          </h3>

          {/* Improved proportional Bar chart */}
          <div className="flex items-end gap-6 h-36 flex-1 pt-4 border-b border-amber-100/50 pb-0">
            {gradeData.map((g) => {
              const maxVal = Math.max(1, ...gradeData.map(d=>d.value));
              const pct = (g.value / maxVal) * 100;
              return (
                <div key={g.name} className="flex flex-col items-center flex-1 h-full justify-end relative group">
                  <span className="font-display font-bold text-lg mb-1.5 transition-transform group-hover:-translate-y-1" style={{ color: g.color }}>
                    {g.value}
                  </span>
                  <div className="w-full rounded-t-lg transition-all duration-700 shadow-sm opacity-90 group-hover:opacity-100 bg-gradient-to-t"
                    style={{ 
                      height: `${Math.max(4, pct)}%`, // min 4% to show a nub 
                      background: g.color,
                      backgroundImage: `linear-gradient(to top, ${g.color}99, ${g.color})`
                    }} />
                  <p className="text-[10px] font-display font-bold text-gray-500 mt-2 uppercase tracking-widest">{g.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Application Status donut */}
        <div className="glass-card rounded-xl p-5 flex flex-col justify-between">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Application Status
          </h3>
          <div className="relative flex-1">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={appStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {appStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {appStatusData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded shadow-sm" style={{ background: color }} />
                  <span className="font-body text-xs font-medium text-gray-600">{name}</span>
                </div>
                <span className="font-display font-bold text-xs" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Overview -> Replaced with PQC Readiness Posture */}
        <div className="glass-card rounded-xl p-5 flex flex-col justify-between">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-4">
            Migration Readiness Overview
          </h3>
          <div className="space-y-5 mt-2">
            {[
              { label: 'Secure & PQC Ready',     items: ['Elite-PQC Ready'], color: '#16a34a', icon: '✅' },
              { label: 'Moderate / Transition',  items: ['Standard'],        color: '#f59e0b', icon: '🚧' },
              { label: 'High Risk / Vulnerable', items: ['Legacy', 'Critical'], color: '#dc2626', icon: '❌' }
            ].map((group) => {
              const count = appStatusData
                .filter(d => group.items.includes(d.name))
                .reduce((s, d) => s + d.value, 0);
              const total = appStatusData.reduce((s,d)=>s+d.value, 0) || 1;
              const pct = Math.round((count/total)*100);
              return (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-end">
                    <span className="font-body text-xs font-medium text-gray-700 flex items-center gap-2">
                      <span className="text-[10px] bg-white rounded shadow-sm p-0.5">{group.icon}</span> {group.label}
                    </span>
                    <span className="font-display text-xs font-bold" style={{ color: group.color }}>{count} <span className="opacity-50 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-amber-100/50 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: group.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">

        {/* PQC Support table */}
        <div className="glass-card rounded-xl overflow-hidden col-span-1">
          <div className="px-4 py-3 border-b border-amber-100">
            <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
              Assets PQC Support
            </h3>
          </div>
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50">
                <th className="px-4 py-2.5 text-left font-display font-semibold text-pnb-crimson">Assets Name</th>
                <th className="px-4 py-2.5 text-center font-display font-semibold text-pnb-crimson">PQC Support</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => (
                <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50/50 ${i%2===0?'bg-white/80':'bg-red-50/10'}`}>
                  <td className="px-4 py-2.5 text-gray-700">{a.name} ({a.ip})</td>
                  <td className="px-4 py-2.5 text-center">
                    {a.pqc
                      ? <CheckCircle size={16} className="inline text-green-500" />
                      : <XCircle size={16} className="inline text-red-500" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Improvement Recommendations */}
        <div className="glass-card rounded-xl p-5 col-span-1">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Improvement Recommendations
          </h3>
          <div className="space-y-2">
            {recommendations.map((r, i) => (
              <div key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border
                  ${r.priority === 'High'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                  }`}
              >
                <span className="text-base">{r.icon}</span>
                <div>
                  <p className="font-body text-xs text-gray-700">{r.text}</p>
                  <span className={`font-display text-xs font-bold ${r.priority==='High'?'text-red-600':'text-amber-600'}`}>
                    {r.priority} Priority
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* App A Details */}
        <div className="glass-card rounded-xl p-5 col-span-1">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            App A Details
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-pnb-crimson rounded-full flex items-center justify-center text-white font-display text-xs font-bold">A</div>
              <span className="font-display font-bold text-gray-800">App A</span>
            </div>
            {[
              { icon:'👤', label:'Owner',    value:'Team 1'    },
              { icon:'🌐', label:'Exposure', value:'Internet'  },
              { icon:'🔒', label:'TLS',      value:'RSA / ECC' },
              { icon:'⭐', label:'Score',    value:'480 (Critical)', red: true },
              { icon:'📋', label:'Status',   value:'Legacy',   warn: true },
            ].map(({ icon, label, value, red, warn }) => (
              <div key={label} className="flex items-center gap-3 p-2 rounded-lg bg-amber-50 border border-amber-100">
                <span className="text-base">{icon}</span>
                <div className="flex-1">
                  <p className="font-body text-xs text-gray-500">{label}</p>
                  <p className={`font-display text-xs font-bold ${red ? 'text-red-600' : warn ? 'text-amber-600' : 'text-gray-800'}`}>
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Migration progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs font-body text-gray-500 mb-1">
              <span>PQC Migration Progress</span>
              <span className="font-display font-bold text-amber-600">33%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full" style={{ width: '33%' }} />
            </div>
            <div className="flex justify-between text-xs font-body text-gray-500 mb-1 mt-2">
              <span>Quantum Readiness</span>
              <span className="font-display font-bold text-orange-600">22%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full" style={{ width: '22%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
