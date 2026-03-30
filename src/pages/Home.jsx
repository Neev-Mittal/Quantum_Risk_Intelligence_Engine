import { useState, useEffect } from 'react'
import {
  Globe, Layers, Server, AlertTriangle, ShieldOff,
  Plus, RefreshCw, Search, ChevronDown, Wifi, Lock, Database, Cpu
} from 'lucide-react'
import {
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'

import dataAPI from '../dataAPI'

const ICON_MAP = {
  Layers, Globe, Server, AlertTriangle, ShieldOff, Wifi, Lock, Database, Cpu
}

const riskColor = { High: 'risk-high', Medium: 'risk-medium', Moderate: 'risk-medium', Low: 'risk-low', Critical: 'risk-critical', Unknown: 'bg-gray-500' }
const certColor  = { Valid: 'text-green-600', Expiring: 'text-amber-500', Expired: 'text-red-600', Unknown: 'text-gray-500' }

const recentActivity = [
  { icon: '⊗', text: 'Scan completed: crypto asset classification active', time: '10 min ago', color: 'text-blue-500'   },
  { icon: '⚠', text: 'Weak cipher detected: vpn.pnb.bank.in',             time: '1 hr ago',   color: 'text-amber-500' },
  { icon: '⊠', text: 'Certificate expiring soon: api.pnb.in',             time: '3 hrs ago',  color: 'text-orange-500' },
  { icon: '✦', text: 'API endpoint discovered: gateway.pnb.bank.in',      time: '1 day ago',  color: 'text-indigo-500' },
  { icon: '⚙', text: 'CDN/WAF asset reclassified',                        time: '2 days ago', color: 'text-green-500' },
]

const ASSET_TYPE_ICON = {
  web_application: '🌐',
  api:             '🔌',
  web_server:      '🖥',
  database:        '🗄',
  mail_server:     '📧',
  dns_server:      '🌍',
  cdn_proxy:       '☁',
  load_balancer:   '⚖',
  ssl_certificate: '🔒',
  ip_address:      '📡',
  domain:          '🏷',
  unknown:         '❓',
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statCards, setStatCards] = useState([])
  const [assetTypeDist, setAssetTypeDist] = useState([])
  const [riskDist, setRiskDist] = useState([])
  const [certExpiry, setCertExpiry] = useState([])
  const [ipBreakdown, setIpBreakdown] = useState([])
  const [inventoryData, setInventoryData] = useState([])
  const [dnsRecords, setDnsRecords] = useState([])
  const [cryptoOverview, setCryptoOverview] = useState([])
  const [infraSummary, setInfraSummary] = useState({})
  const [subnetSummary, setSubnetSummary] = useState([])
  const [cipherStrDist, setCipherStrDist] = useState([])

  useEffect(() => {
    const fetchDashboardState = async () => {
      try {
        const res = await dataAPI.getDashboardData()
        if (res.success) {
          setStatCards(res.statCards.map(c => ({ ...c, icon: ICON_MAP[c.icon] || Server })))
          setAssetTypeDist(res.assetTypeDist)
          setRiskDist(res.riskDist)
          setCertExpiry(res.certExpiry)
          setIpBreakdown(res.ipBreakdown)
          setInfraSummary(res.infraSummary || {})
          setSubnetSummary(res.subnetSummary || [])
          // Cipher strength dist for chart
          const csd = res.cipherStrengthDist || {}
          setCipherStrDist(
            Object.entries(csd).filter(([, v]) => v > 0).map(([k, v]) => ({
              name: k, value: v,
              color: k === 'Strong' ? '#16a34a' : k === 'Moderate' ? '#f59e0b' : k === 'Weak' ? '#dc2626' : '#94a3b8'
            }))
          )
        }

        const extRes = await dataAPI.getHomepageExtras()
        if (extRes.success) {
          setDnsRecords(extRes.dnsRecords)
          setCryptoOverview(extRes.cryptoOverview)
          // Derive inventory preview from crypto overview
          setInventoryData(extRes.cryptoOverview.slice(0, 5).map((c, i) => ({
            id: i,
            name: c.asset,
            url:  `https://${c.asset}`,
            ipv4: '-',
            type: c.assetTypeLabel,
            assetType: c.assetType,
            owner: 'IT',
            risk: c.risk || 'Moderate',
            cert: c.daysLeft === null ? 'Unknown' : c.daysLeft < 0 ? 'Expired' : c.daysLeft < 30 ? 'Expiring' : 'Valid',
            keyLen: c.keyLen,
            scan: new Date().toLocaleDateString(),
          })))
        }
      } catch (err) {
        console.error('Failed fetching home dashboard stats:', err)
      }
    }
    fetchDashboardState()
  }, [])

  const certExpiryWidths = (() => {
    const total = certExpiry.reduce((a, c) => a + (c.count || 0), 0) || 1
    return certExpiry.map(c => Math.round(((c.count || 0) / total) * 100))
  })()

  return (
    <div className="space-y-5">
      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg, alert, critical }) => {
          const numValue = parseInt(value, 10)
          const hasIssue = numValue > 0
          return (
            <div key={label}
              className={`stat-card glass-card rounded-xl p-4 cursor-pointer relative overflow-hidden transition-all duration-300
                ${critical ? 'border-red-300 shadow-sm shadow-red-100/50' : 'border-amber-100/60 shadow-sm shadow-amber-100/20'}
                ${alert ? 'border-amber-300 shadow-sm shadow-amber-100/50' : ''}
                ${critical && hasIssue ? 'animate-flash-critical' : ''}
                ${alert && hasIssue ? 'animate-flash-warning' : ''}
                hover:shadow-md hover:-translate-y-1`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${bg} shadow-sm`}>
                  <Icon size={18} style={{ color }} />
                </div>
                {/* Status indicator pip */}
                {critical && hasIssue ? <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-red-500 rounded-full badge-critical" /> :
                 critical && !hasIssue ? <span className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full opacity-30" /> :
                 alert && hasIssue ? <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" /> :
                 alert && !hasIssue ? <span className="absolute top-4 right-4 w-2 h-2 bg-amber-500 rounded-full opacity-30" /> : null}
              </div>
              <p className="font-display text-3xl font-bold tracking-tight" style={{ color }}>{value}</p>
              <p className="font-body text-xs text-gray-500 mt-1 font-medium tracking-wide uppercase">{label}</p>
            </div>
          )
        })}
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Asset Type Distribution */}
        <div className="glass-card rounded-xl p-4 col-span-1">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Asset Type Distribution
          </h3>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={assetTypeDist} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65}>
                {assetTypeDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {assetTypeDist.slice(0, 6).map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                  <span className="font-body text-gray-600 truncate max-w-20">{d.name}</span>
                </div>
                <span className="font-display font-bold text-gray-800">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Risk Distribution */}
        <div className="glass-card rounded-xl p-4 col-span-1 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-4">
              Asset Risk Distribution
            </h3>
            <div className="space-y-4">
              {(() => {
                const totalRisk = riskDist.reduce((acc, r) => acc + (r.count || 0), 0) || 1
                return [
                  { label: 'Elite',    orig: 'Elite',    color: '#16a34a', bg: 'bg-green-50',  txt: 'text-green-600',  icon: '✦' },
                  { label: 'Standard', orig: 'Standard', color: '#f59e0b', bg: 'bg-amber-50',  txt: 'text-amber-600',  icon: '🛡' },
                  { label: 'Legacy',   orig: 'Legacy',   color: '#dc2626', bg: 'bg-red-50',    txt: 'text-red-600',    icon: '⚠' },
                  { label: 'Critical', orig: 'Critical', color: '#7f1d1d', bg: 'bg-rose-50',   txt: 'text-rose-800',   icon: '⊗' },
                ].map(({ label, orig, color, icon, bg, txt }) => {
                  const item = riskDist.find(r => r.name === orig) || {}
                  const value = item.count || 0
                  return (
                    <div key={label} className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-sm shadow-sm border border-white ${bg} ${txt}`}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="font-body font-medium text-gray-600">{label}</span>
                          <span className="font-display font-bold" style={{ color }}>{value}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200/60 rounded-full overflow-hidden shadow-inner">
                          <div className="h-full rounded-full transition-all duration-500" style={{
                            width: `${Math.min(100, (value / totalRisk) * 100)}%`,
                            background: color
                          }} />
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>

        {/* Certificate Expiry Timeline */}
        <div className="glass-card rounded-xl p-4 col-span-1">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            Certificate Expiry Timeline
          </h3>
          <div className="space-y-2">
            {certExpiry.map(c => (
              <div key={c.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
                  <span className="font-body text-xs text-gray-600">{c.label}</span>
                </div>
                <span className="font-display text-sm font-bold text-gray-800">{c.count}</span>
              </div>
            ))}
          </div>
          {/* Stacked bar */}
          <div className="mt-3 h-3 rounded-full overflow-hidden flex">
            {certExpiry.map((c, i) => (
              <div key={i} style={{ width: `${certExpiryWidths[i] || 0}%`, background: c.color }} />
            ))}
          </div>
          <p className="font-body text-xs text-gray-400 mt-2 text-center">
            {certExpiry.reduce((s, c) => s + (c.count || 0), 0)} total certificates tracked
          </p>
        </div>

        {/* IP Version Breakdown */}
        <div className="glass-card rounded-xl p-4 col-span-1">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
            IP & Subnet Distribution
          </h3>
          <ResponsiveContainer width="100%" height={100}>
            <PieChart>
              <Pie data={ipBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={44}>
                {ipBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-around text-xs mt-1">
            {ipBreakdown.map(d => (
              <span key={d.name} className="font-display font-semibold" style={{ color: d.color }}>
                ■ {d.name}
              </span>
            ))}
          </div>
          {/* Top subnets */}
          {subnetSummary.slice(0, 3).length > 0 && (
            <div className="mt-2 space-y-1">
              {subnetSummary.slice(0, 3).map(({ subnet, count }) => (
                <div key={subnet} className="flex justify-between text-xs">
                  <span className="font-mono text-gray-500 truncate max-w-28">{subnet}</span>
                  <span className="font-display font-bold text-gray-700">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ASSET INVENTORY TABLE */}
      <div className="glass-card rounded-xl overflow-hidden shadow-sm shadow-amber-900/5">
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100/50 bg-white/40">
          <h3 className="font-display text-sm font-semibold text-pnb-crimson uppercase tracking-wide">
            Asset Inventory Preview
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-1.5 text-xs border border-amber-200 rounded-lg
                           bg-white font-body focus:outline-none focus:ring-1 focus:ring-amber-400 w-36"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-gradient-to-r from-amber-50 to-amber-100/50 border-b border-amber-200/50">
                {['Asset Name', 'Asset Type', 'Risk', 'Cert Status', 'Key Length', 'CDN / WAF', 'API', 'Days Left'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-display font-bold text-pnb-crimson text-xs tracking-wider uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventoryData
                .filter(r => !searchQuery || r.name.includes(searchQuery) || r.type.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'table-row-even' : 'table-row-odd'}>
                  <td className="px-3 py-2.5 font-semibold text-blue-700 max-w-40 truncate">
                    {row.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs font-display font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${row.color || '#94a3b8'}22`, color: row.color || '#64748b' }}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-white text-xs font-display font-semibold ${riskColor[row.risk] || 'bg-gray-500'}`}>
                      {row.risk}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${certColor[row.cert]}`}>
                    {row.cert === 'Valid' ? 'Valid' : row.cert === 'Expiring' ? 'Expiring' : row.cert === 'Expired' ? 'Expired' : 'Unknown'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{row.keyLen}</td>
                  <td className="px-3 py-2.5 text-center">
                    {row.cdnProvider
                      ? <span className="bg-blue-100 text-blue-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">{row.cdnProvider}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.isApi
                      ? <span className="bg-indigo-100 text-indigo-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">{row.apiType || 'API'}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono font-bold text-center"
                    style={{ color: row.daysLeft === null ? '#94a3b8' : row.daysLeft < 0 ? '#dc2626' : row.daysLeft < 30 ? '#f59e0b' : '#16a34a' }}>
                    {row.daysLeft !== null && row.daysLeft !== undefined ? row.daysLeft : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM ROW: DNS Records + Crypto Overview + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Asset DNS Records */}
        <div className="glass-card rounded-xl overflow-hidden shadow-sm shadow-amber-900/5">
          <div className="px-5 py-3.5 border-b border-amber-100/50 flex items-center justify-between bg-white/40">
            <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
              Asset DNS Records
            </h3>
            <span className="text-xs font-display font-semibold text-pnb-crimson">pnb.bank.in</span>
          </div>
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50">
                {['Hostname', 'Type', 'IP Address', 'Subnet'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-display font-semibold text-pnb-crimson">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dnsRecords.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? 'table-row-even' : 'table-row-odd'}>
                  <td className="px-3 py-1.5 font-mono text-gray-700 truncate max-w-28" title={r.hostname}>
                    {r.hostname}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="bg-blue-100 text-blue-700 text-xs font-display font-bold px-1.5 py-0.5 rounded">
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-700">{r.ip}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-400 text-xs truncate max-w-24">{r.subnet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Crypto & Security Overview */}
        <div className="glass-card rounded-xl overflow-hidden shadow-sm shadow-amber-900/5">
          <div className="px-5 py-3.5 border-b border-amber-100/50 bg-white/40">
            <h3 className="font-display text-xs font-bold text-pnb-crimson uppercase tracking-wide">
              Crypto &amp; Security Overview
            </h3>
          </div>
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50">
                {['Asset', 'Type', 'Cipher Str.', 'TLS', 'EV', 'WAF'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-display font-semibold text-pnb-crimson">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cryptoOverview.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'table-row-even' : 'table-row-odd'}>
                  <td className="px-2 py-1.5 text-gray-700 truncate max-w-20" title={row.asset}>
                    {row.asset.split('.')[0]}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="text-xs font-display font-semibold text-gray-600">
                      {row.assetTypeLabel?.split(' ')[0] || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                      row.cipherStrength === 'Strong'   ? 'bg-green-100 text-green-700' :
                      row.cipherStrength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                      row.cipherStrength === 'Weak'     ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-400'
                    }`}>{row.cipherStrength}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`font-display font-bold text-xs ${row.tlsColor}`}>
                      {row.tls}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.isEV ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.waf ? <span className="text-blue-600">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Activity */}
        <div className="glass-card rounded-xl overflow-hidden shadow-sm shadow-amber-900/5 flex flex-col justify-between">
          <div className="px-5 py-3.5 border-b border-amber-100/50 bg-white/40">
            <h3 className="font-display text-xs font-bold text-pnb-crimson uppercase tracking-wide">
              Recent Scans &amp; Activity
            </h3>
          </div>
          <div className="p-3 space-y-2">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`${a.color} text-sm flex-shrink-0 mt-0.5`}>{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-xs text-gray-700 truncate">{a.text}</p>
                  <p className="font-body text-xs text-gray-400">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Infra pill summary */}
          <div className="mx-3 mb-3 bg-slate-800 rounded-lg p-2.5">
            <p className="font-display text-xs text-amber-300 mb-2">Infrastructure Breakdown</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              {[
                { label: 'CDN', value: infraSummary.cdnDetected || 0, color: '#3b82f6' },
                { label: 'WAF', value: infraSummary.wafDetected  || 0, color: '#f59e0b' },
                { label: 'LB',  value: infraSummary.loadBalanced || 0, color: '#6366f1' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="font-display text-base font-bold" style={{ color }}>{value}</p>
                  <p className="font-body text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
