import { useState, useEffect } from 'react'
import { Search, Calendar } from 'lucide-react'
import dataAPI from '../dataAPI'

const BASE_TAB_CONFIG = {
  Domains:             { label: 'Domains',            subTabs: ['New', 'False Positive', 'Confirmed', 'All'] },
  SSL:                 { label: 'SSL Certificates',   subTabs: ['New', 'False/ignore',    'Confirmed', 'All'] },
  'IP Address/Subnets':{ label: 'IP / Subnets',       subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
  Software:            { label: 'Software',            subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
  APIs:                { label: 'APIs',               subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
}

function StatusBadge({ text }) {
  const color =
    text.includes('New')       ? 'bg-blue-500'  :
    text.includes('False')     ? 'bg-gray-500'   :
    text.includes('Confirmed') ? 'bg-green-600'  : 'bg-amber-500'
  return (
    <span className={`${color} text-white font-display text-xs font-bold px-3 py-1 rounded-full`}>
      {text}
    </span>
  )
}

function CipherBadge({ strength }) {
  const cls =
    strength === 'Strong'   ? 'bg-green-100 text-green-700' :
    strength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
    strength === 'Weak'     ? 'bg-red-100   text-red-700'   :
    'bg-gray-100 text-gray-400'
  return <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${cls}`}>{strength || '—'}</span>
}

function DaysLeftBadge({ days }) {
  if (days === null || days === undefined) return <span className="text-gray-400">—</span>
  const color = days < 0 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-green-600'
  const label = days < 0 ? `${Math.abs(days)}d ago` : `${days}d`
  return <span className={`font-mono font-bold ${color}`}>{label}</span>
}

export default function AssetDiscovery() {
  const [mainTab, setMainTab]     = useState('Domains')
  const [subTabIdx, setSubTabIdx] = useState(3)
  const [showGraph, setShowGraph] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateStart, setDateStart] = useState('')

  const [domainData,   setDomainData]   = useState({ New: [], 'False Positive': [], Confirmed: [], All: [] })
  const [sslData,      setSslData]      = useState({ New: [], 'False/ignore': [], Confirmed: [], All: [] })
  const [ipData,       setIpData]       = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })
  const [softwareData, setSoftwareData] = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })
  const [apiData,      setApiData]      = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })

  useEffect(() => {
    const fetchDiscoveryData = async () => {
      try {
        const res = await dataAPI.getAssetDiscoveryData()
        if (res.success) {
          setDomainData(res.domainData)
          setSslData(res.sslData)
          setIpData(res.ipData)
          setSoftwareData(res.softwareData)
          setApiData(res.apiData || { New: [], 'False or ignore': [], Confirmed: [], All: [] })
        }
      } catch (err) {
        console.error('Failed to fetch Asset Discovery Data', err)
      }
    }
    fetchDiscoveryData()
  }, [])

  const subTabs = BASE_TAB_CONFIG[mainTab].subTabs
  const subKey  = subTabs[subTabIdx].split(' (')[0].replace(/\s*\(\d+\)/, '').trim()

  const getRows = () => {
    const map = { Domains: domainData, SSL: sslData, 'IP Address/Subnets': ipData, Software: softwareData, APIs: apiData }
    return (map[mainTab]?.[subKey] || map[mainTab]?.All || [])
  }

  const rows = getRows().filter(r =>
    !searchQuery ||
    Object.values(r).some(v => String(v).toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // ── Table content ──────────────────────────────────────────────────────────
  const renderTable = () => {
    if (mainTab === 'Domains') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
              {['Detection Date', 'Domain Name', 'Registration Date', 'Registrar', 'Company'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-display font-semibold tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50 transition-colors ${i%2===0?'bg-white/80':'bg-red-50/20'}`}>
                <td className="px-4 py-3 text-gray-700">{r.detected}</td>
                <td className="px-4 py-3 text-blue-700 font-semibold font-mono">{r.domain}</td>
                <td className="px-4 py-3 text-gray-700">{r.registered}</td>
                <td className="px-4 py-3 text-gray-600">{r.registrar}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{r.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    if (mainTab === 'SSL') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
              {['Common Name', 'Valid From', 'Valid To', 'Days Left', 'Cipher Str.', 'Protocol', 'EV', 'Wildcard', 'CT', 'SANs', 'CA'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50 transition-colors ${i%2===0?'bg-white/80':'bg-red-50/20'}`}>
                <td className="px-3 py-2.5 text-blue-700 font-semibold font-mono max-w-40 truncate" title={r.common}>{r.common}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.validFrom}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.validTo}</td>
                <td className="px-3 py-2.5"><DaysLeftBadge days={r.daysLeft} /></td>
                <td className="px-3 py-2.5"><CipherBadge strength={r.cipherStrength} /></td>
                <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{r.protocol || '—'}</td>
                <td className="px-3 py-2.5 text-center">{r.isEV     ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-center">{r.isWildcard ? <span className="text-amber-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-center">{r.ctLogged  ? <span className="text-blue-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-gray-500 max-w-36 truncate" title={r.sans}>{r.sans || '—'}</td>
                <td className="px-3 py-2.5">
                  <span className="bg-blue-100 text-blue-700 font-display font-bold text-xs px-2 py-0.5 rounded">
                    {r.authority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    if (mainTab === 'IP Address/Subnets') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
              {['Detection Date', 'IP Address', 'Port', 'Subnet (/24)', 'Service Type', 'Port Category', 'ASN', 'Company'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50 transition-colors ${i%2===0?'bg-white/80':'bg-red-50/20'}`}>
                <td className="px-3 py-2.5 text-gray-700">{r.detected}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{r.ip}</td>
                <td className="px-3 py-2.5">
                  <span className="bg-amber-100 text-amber-700 font-mono font-bold px-2 py-0.5 rounded">{r.ports}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-600">{r.subnet || '—'}</td>
                <td className="px-3 py-2.5">
                  <span className="bg-purple-100 text-purple-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">
                    {r.serviceType || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{r.portCategory || '—'}</td>
                <td className="px-3 py-2.5 font-display font-bold text-pnb-crimson">{r.asn}</td>
                <td className="px-3 py-2.5 font-display font-semibold text-pnb-crimson">{r.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    if (mainTab === 'Software') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
              {['Detection Date', 'Product', 'Version', 'Type', 'Port', 'Host', 'Company'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-display font-semibold tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-amber-50 hover:bg-amber-50 transition-colors ${i%2===0?'bg-white/80':'bg-red-50/20'}`}>
                <td className="px-4 py-3 text-gray-700">{r.detected}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{r.product}</td>
                <td className="px-4 py-3 font-mono text-gray-600">{r.version}</td>
                <td className="px-4 py-3 text-gray-700">{r.type}</td>
                <td className="px-4 py-3">
                  <span className="bg-purple-100 text-purple-700 font-mono font-bold px-2 py-0.5 rounded">{r.port}</span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{r.host}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{r.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    if (mainTab === 'APIs') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-indigo-800 to-purple-800 text-white">
              {['Host / Endpoint', 'IP', 'Port', 'API Type', 'Rate Limited', 'Versioned', 'CDN Provider', 'WAF', 'Detection Indicators', 'Company'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-4 py-8 text-center font-body text-gray-400">
                  No API endpoints detected. APIs are auto-detected via subdomain patterns, response headers, and body content.
                </td>
              </tr>
            ) : rows.map((r, i) => (
              <tr key={i} className={`border-b border-indigo-50 hover:bg-indigo-50/30 transition-colors ${i%2===0?'bg-white/80':'bg-indigo-50/20'}`}>
                <td className="px-3 py-2.5 font-mono font-bold text-indigo-700 max-w-36 truncate" title={r.host}>{r.host}</td>
                <td className="px-3 py-2.5 font-mono text-gray-600">{r.ip}</td>
                <td className="px-3 py-2.5">
                  <span className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded">{r.port}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="bg-indigo-100 text-indigo-700 font-display font-bold text-xs px-2 py-0.5 rounded">
                    {r.apiType || 'REST'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">{r.rateLimited && r.rateLimited !== '—' ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-center">{r.versioned && r.versioned !== '—' ? <span className="text-blue-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5">
                  {r.cdnProvider && r.cdnProvider !== '-'
                    ? <span className="bg-blue-100 text-blue-700 font-display font-bold text-xs px-1.5 py-0.5 rounded">☁ {r.cdnProvider}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {r.waf && r.waf !== '—' ? <span className="text-amber-600 font-bold">🛡 Yes</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 max-w-56 truncate text-gray-500" title={r.indicators}>{r.indicators || '—'}</td>
                <td className="px-3 py-2.5 font-display font-bold text-pnb-crimson">{r.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
  }

  // ── Network graph SVG ─────────────────────────────────────────────────────
  const GraphView = () => (
    <div className="glass-card rounded-xl p-4 relative overflow-hidden" style={{ height: 420 }}>
      <p className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
        Asset Relationship Graph
      </p>
      <svg width="100%" height="360" className="overflow-visible">
        {[
          [400,180, 200,100],[400,180, 600,100],[400,180, 250,260],
          [400,180, 550,260],[400,180, 150,200],[400,180, 650,200],
          [200,100, 100,60], [600,100, 700,60],
        ].map(([x1,y1,x2,y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22c55e" strokeWidth="1.5" opacity="0.6" />
        ))}
        <circle cx="400" cy="180" r="22" fill="#92400e" />
        <text x="400" y="175" textAnchor="middle" fill="#fcd34d" fontSize="8" fontFamily="Oxanium">TAG</text>
        <text x="400" y="187" textAnchor="middle" fill="#fcd34d" fontSize="7" fontFamily="Oxanium">Scanning IP</text>
        {[
          [200,100,'🌐','Domain'],   [600,100,'🔌','API'],
          [250,260,'🌐','WebApp'],   [550,260,'☁','CDN'],
          [150,200,'📡','IP'],       [650,200,'📡','IP'],
          [100,60, '🔒','SSL'],      [700,60, '🗄','DB'],
        ].map(([cx,cy,icon,label], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="20"
              fill={label==='API'?'#6366f1': label==='Domain'||label==='WebApp'?'#16a34a': label==='CDN'?'#3b82f6': label==='SSL'?'#1d4ed8': label==='DB'?'#f59e0b':'#92400e'}
              opacity="0.9" />
            <text x={cx} y={cy-2} textAnchor="middle" fill="white" fontSize="9">{icon}</text>
            <text x={cx} y={cy+11} textAnchor="middle" fill="white" fontSize="6" fontFamily="DM Sans">{label}</text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs font-body">
        {[['#16a34a','Domain / Web'],['#6366f1','API'],['#3b82f6','CDN'],['#1d4ed8','SSL'],['#f59e0b','Database']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{background:c}} />
            <span className="text-gray-600">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Search view ───────────────────────────────────────────────────────────
  const SearchView = () => (
    <div className="glass-card rounded-xl p-8 max-w-2xl mx-auto mt-4">
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search domain, URL, IP, SSL fingerprint..."
          className="w-full pl-11 pr-4 py-3 text-sm border-2 border-amber-300 rounded-xl
                     bg-amber-50 font-body text-pnb-crimson placeholder-amber-400
                     focus:outline-none focus:ring-2 focus:ring-amber-400" />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} className="text-amber-600" />
          <span className="font-display text-sm font-semibold text-pnb-crimson">Time Period</span>
        </div>
        <p className="font-body text-xs text-gray-500 mb-3">Specify the Period for data</p>
        <div className="flex items-center gap-3">
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            className="border border-amber-300 rounded-lg px-3 py-2 text-xs font-body focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <span className="font-display text-pnb-amber font-bold">–</span>
          <input type="date" className="border border-amber-300 rounded-lg px-3 py-2 text-xs font-body focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <button className="mt-4 bg-gradient-to-r from-pnb-gold to-pnb-amber text-white font-display
                           font-semibold text-xs px-6 py-2 rounded-lg hover:from-pnb-amber hover:to-pnb-crimson
                           transition-all duration-300">
          Search
        </button>
      </div>
    </div>
  )

  const getCount = (tab) => {
    const map = { Domains: domainData, SSL: sslData, 'IP Address/Subnets': ipData, Software: softwareData, APIs: apiData }
    return map[tab]?.All?.length || 0
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Asset Discovery</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGraph(!showGraph)}
            className={`font-display text-xs font-semibold px-4 py-2 rounded-lg transition-colors
              ${showGraph === true ? 'bg-pnb-crimson text-white' : 'bg-white border border-amber-300 text-pnb-amber hover:bg-amber-50'}`}>
            {showGraph === true ? '⊞ Table View' : '⬡ Graph View'}
          </button>
          <button onClick={() => setShowGraph('search')}
            className="font-display text-xs font-semibold px-4 py-2 rounded-lg bg-white border border-amber-300 text-pnb-amber hover:bg-amber-50 transition-colors">
            <Search size={12} className="inline mr-1" />Search IoC
          </button>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.keys(BASE_TAB_CONFIG).map(tab => (
          <button key={tab}
            onClick={() => { setMainTab(tab); setSubTabIdx(0) }}
            className={`font-display text-xs font-semibold px-5 py-2.5 rounded-xl transition-all duration-200
              ${mainTab === tab
                ? 'bg-gradient-to-r from-pnb-crimson to-red-700 text-white shadow-lg shadow-red-200'
                : 'bg-white/80 text-gray-600 hover:bg-amber-50 border border-amber-200'
              }`}>
            {BASE_TAB_CONFIG[tab].label} ({getCount(tab)})
          </button>
        ))}
      </div>

      {/* Sub tabs + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2">
          {subTabs.map((st, idx) => {
            const map = { Domains: domainData, SSL: sslData, 'IP Address/Subnets': ipData, Software: softwareData, APIs: apiData }
            const count = map[mainTab]?.[st]?.length || 0
            return (
              <button key={idx} onClick={() => setSubTabIdx(idx)}
                className={`font-display text-xs font-semibold px-4 py-2 rounded-lg transition-all
                  ${subTabIdx === idx ? 'bg-amber-500 text-white' : 'bg-white/70 text-gray-600 hover:bg-amber-50 border border-amber-200'}`}>
                {st} ({count})
              </button>
            )
          })}
        </div>
        {/* Inline search */}
        <div className="ml-auto relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter results..."
            className="pl-8 pr-3 py-1.5 text-xs border border-amber-200 rounded-lg bg-white font-body
                       focus:outline-none focus:ring-1 focus:ring-amber-400 w-40" />
        </div>
      </div>

      {/* Content */}
      {showGraph === 'search' ? (
        <SearchView />
      ) : showGraph === true ? (
        <GraphView />
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            {rows.length > 0 ? renderTable() : (
              <div className="p-8 text-center font-body text-gray-400 text-sm">
                No data for this tab yet. Run a scan to populate asset discovery records.
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/30 flex justify-between items-center">
            <span className="font-body text-xs text-gray-500">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
