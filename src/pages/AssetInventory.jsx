import { useState, useEffect } from 'react'
import { Search, Plus, RefreshCw, Filter, Download, Eye, ChevronDown } from 'lucide-react'
import { LoadingSpinner, ErrorAlert, DataEmpty } from '../components/DataLoaders.jsx'
import dataAPI from '../dataAPI.js'

const riskColors   = { Critical: 'risk-critical', High: 'risk-high', Medium: 'risk-medium', Moderate: 'risk-medium', Low: 'risk-low', Unknown: 'bg-gray-500 text-white' }
const certIcons    = { Valid: '', Expiring: '', Expired: '', Unknown: '' }
const certColors   = { Valid: 'text-green-600', Expiring: 'text-amber-500', Expired: 'text-red-600', Unknown: 'text-gray-400' }

const ASSET_TYPE_COLORS = {
  web_application: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  api:             { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  web_server:      { bg: 'bg-sky-100',     text: 'text-sky-700'    },
  database:        { bg: 'bg-amber-100',   text: 'text-amber-700'  },
  mail_server:     { bg: 'bg-green-100',   text: 'text-green-700'  },
  dns_server:      { bg: 'bg-purple-100',  text: 'text-purple-700' },
  cdn_proxy:       { bg: 'bg-pink-100',    text: 'text-pink-700'   },
  load_balancer:   { bg: 'bg-orange-100',  text: 'text-orange-700' },
  ssl_certificate: { bg: 'bg-teal-100',    text: 'text-teal-700'   },
  ip_address:      { bg: 'bg-gray-100',    text: 'text-gray-600'   },
  domain:          { bg: 'bg-lime-100',    text: 'text-lime-700'   },
  unknown:         { bg: 'bg-gray-100',    text: 'text-gray-500'   },
}

const atStyle = (key) => ASSET_TYPE_COLORS[key] || ASSET_TYPE_COLORS.unknown

const fmtAssetType = (key) =>
  (key || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const ALL_TYPES = ['All', 'web_application', 'api', 'web_server', 'database', 'cdn_proxy', 'mail_server', 'ssl_certificate', 'unknown']
const RISK_FILTERS = ['Critical', 'High', 'Moderate', 'Low', 'Unknown']

export default function AssetInventory() {
  const [assets, setAssets]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')
  const [selected, setSelected] = useState([])
  const [expandedRow, setExpandedRow] = useState(null)
  const [page, setPage]         = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => { loadAssets() }, [])

  const loadAssets = async () => {
    setLoading(true)
    setError(null)

    // Load from enriched_cbom for full classification data
    const result = await dataAPI.getEnrichedAssets(5000)

    if (result.success && result.assets.length > 0) {
      // Deduplicate by name — same host on multiple ports shows as one entry
      const seen = new Set()
      const unique = result.assets.filter(a => {
        if (seen.has(a.name)) return false
        seen.add(a.name)
        return true
      })

      const mapped = unique.map((a, i) => {
        let calculatedRisk = a.riskCategory || 'Moderate';
        // If the asset could not be scanned (resulting in unknown fields), do not default it to Critical.
        // It should only be Critical if we actually successfully scanned it and found a reason.
        if (calculatedRisk === 'Critical' && a.scanStatus !== 'ok') {
          calculatedRisk = 'Unknown';
        }

        return {
          id: i + 1,
          name:         a.name,
          url:          a.url,
          ipv4:         a.ip || '-',
          port:         a.port || '-',
          assetType:    a.assetType || 'unknown',
          assetTypeLabel: fmtAssetType(a.assetType),
          // SSL Details
          cipherStrength: a.sslDetails?.cipher_strength || '-',
          isEV:         a.sslDetails?.is_ev || false,
          isWildcard:   a.sslDetails?.is_wildcard || false,
          daysLeft:     a.sslDetails?.days_until_expiry ?? null,
          ctLogged:     a.sslDetails?.ct_logged || false,
          sans:         a.sslDetails?.sans || [],
          protocol:     a.sslDetails?.protocol_version || a.tlsVersion || '-',
          // API Details
          isApi:        a.apiDetails?.is_api || false,
          apiType:      a.apiDetails?.api_type || null,
          rateLimited:  a.apiDetails?.rate_limited || false,
          versioned:    a.apiDetails?.versioned || false,
          apiIndicators: a.apiDetails?.indicators || [],
          // Network
          subnet:       a.networkDetails?.ip_subnet || '-',
          serviceType:  a.networkDetails?.service_type || '-',
          portCategory: a.networkDetails?.port_category || '-',
          // Infrastructure
          cdnProvider:  a.infrastructure?.cdn_provider || null,
          wafDetected:  a.infrastructure?.waf_detected || false,
          loadBalanced: a.infrastructure?.load_balanced || false,
          detectedServices: a.infrastructure?.detected_services || [],
          // Crypto
          keyLen:       a.keyBits ? `${a.keyBits}-bit` : '-',
          pqc:          a.pqcLabel?.includes('PQC') || false,
          pqcLabel:     a.pqcLabel || '',
          tls:          a.tlsVersion || '-',
          risk:         calculatedRisk,
          owner:        'IT',
        // Cert
        cert:         a.daysLeft === null ? 'Unknown'
                      : a.daysLeft < 0   ? 'Expired'
                      : a.daysLeft < 30  ? 'Expiring' : 'Valid',
        issuer:       (a.issuer || '').replace(/^.*CN=/, '').split(',')[0].trim() || '-',
        webServer:    a.webServer || '-',
        detectedOS:   a.detectedOS || '-',
        lastScan:     new Date().toLocaleDateString(),
        };
      })
      setAssets(mapped)
    } else if (!result.success) {
      setError(result.error || 'Failed to load assets')
    }
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />
  if (error)   return <ErrorAlert error={error} onRetry={loadAssets} />
  if (assets.length === 0) return <DataEmpty message="No assets found in enriched CBOM" />

  const filtered = assets.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.assetTypeLabel.toLowerCase().includes(search.toLowerCase())
    const matchType   = typeFilter === 'All' || a.assetType === typeFilter
    const matchRisk   = riskFilter === 'All' || a.risk === riskFilter
    return matchSearch && matchType && matchRisk
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleSelect = (id) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () =>
    setSelected(s => s.length === paginated.length ? [] : paginated.map(a => a.id))

  // Summary counts for filter bar
  const typeCounts = {}
  assets.forEach(a => { typeCounts[a.assetType] = (typeCounts[a.assetType] || 0) + 1 })

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson">Asset Inventory</h1>
          <p className="font-body text-sm text-gray-600 mt-0.5">
            {assets.length} unique assets · {assets.filter(a => a.isApi).length} APIs ·{' '}
            {assets.filter(a => a.cdnProvider).length} CDN-protected ·{' '}
            {assets.filter(a => a.wafDetected).length} WAF-protected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs font-display font-semibold
                             bg-white border border-amber-300 text-pnb-amber px-3 py-2 rounded-lg
                             hover:bg-amber-50 transition-colors">
            <Download size={13} /> Export
          </button>
          <button onClick={loadAssets} className="flex items-center gap-1.5 text-xs font-display font-semibold
                             bg-pnb-crimson text-white px-3 py-2 rounded-lg hover:bg-red-800 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => {
          const s = atStyle(type)
          return (
              <button key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'All' : type)}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-all
                ${typeFilter === type ? `${s.bg} ${s.text} ring-2 ring-offset-1` : `${s.bg} ${s.text} hover:ring-1`}`}>
              <span>{fmtAssetType(type)}</span>
              <span className="font-mono font-bold">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filters + Search */}
      <div className="glass-card rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search assets, types..."
            className="w-full pl-9 pr-4 py-2 text-sm text-slate-800 border border-amber-200 rounded-lg
                       bg-white font-body focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>

        <div className="flex items-center gap-1 font-display text-xs">
          <span className="text-gray-400 text-xs mr-1">Risk:</span>
          {['All', ...RISK_FILTERS].map(f => (
            <button key={f} onClick={() => { setRiskFilter(f); setPage(1) }}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors
                ${riskFilter === f
                  ? 'bg-pnb-crimson text-white'
                  : 'bg-white border border-amber-200 text-pnb-amber hover:bg-amber-50'
                }`}>
              {f}
            </button>
          ))}
        </div>

        <div className="ml-auto font-body text-xs text-gray-400">
          {filtered.length} of {assets.length} assets
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-amber-50 border-b border-amber-100">
                <th className="px-3 py-3 text-left w-8">
                  <input type="checkbox"
                    checked={selected.length === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="accent-amber-400" />
                </th>
                {['Asset', 'Asset Type', 'IP / Subnet', 'Cipher Str.', 'TLS', 'Key', 'Issuer CA', 'Infrastructure', 'API', 'Risk', 'Cert', 'Days Left', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap text-pnb-crimson text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((row, i) => {
                const s = atStyle(row.assetType)
                const isExpanded = expandedRow === row.id
                return (
                  <>
                    <tr key={row.id}
                      className={`border-b border-amber-50 hover:bg-amber-50/50 transition-colors cursor-pointer
                        ${i % 2 === 0 ? 'bg-white/80' : 'bg-amber-50/40'}`}
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selected.includes(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="accent-amber-400" />
                      </td>
                      {/* Asset name */}
                      <td className="px-3 py-2.5 font-semibold text-blue-700 max-w-36 truncate whitespace-nowrap">
                        {row.name}
                      </td>
                      {/* Asset Type badge */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-display font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                          {row.assetTypeLabel}
                        </span>
                      </td>
                      {/* IP / Subnet */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-gray-700">{row.ipv4}</span>
                        {row.subnet && row.subnet !== '-' && (
                          <span className="block font-mono text-gray-400 text-xs">{row.subnet}</span>
                        )}
                      </td>
                      {/* Cipher Strength */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                          row.cipherStrength === 'Strong'   ? 'bg-green-100 text-green-700' :
                          row.cipherStrength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                          row.cipherStrength === 'Weak'     ? 'bg-red-100   text-red-700'   :
                          'bg-gray-100 text-gray-400'
                        }`}>{row.cipherStrength}</span>
                      </td>
                      {/* TLS */}
                      <td className={`px-3 py-2.5 font-mono font-bold whitespace-nowrap ${
                        row.tls?.includes('1.3') ? 'text-green-600' :
                        row.tls?.includes('1.2') ? 'text-blue-600'  :
                        row.tls?.includes('1.1') ? 'text-orange-500': 'text-gray-400'
                      }`}>{row.tls}</td>
                      {/* Key length */}
                      <td className={`px-3 py-2.5 font-mono font-bold whitespace-nowrap ${
                        row.keyLen.startsWith('4096') ? 'text-green-600' :
                        row.keyLen.startsWith('2048') ? 'text-blue-600'  :
                        row.keyLen.startsWith('1024') ? 'text-red-600'   : 'text-gray-400'
                      }`}>{row.keyLen}</td>
                      {/* Issuer CA */}
                      <td className="px-3 py-2.5 text-gray-600 max-w-28 truncate">{row.issuer}</td>
                      {/* Infrastructure */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {row.cdnProvider && (
                            <span className="bg-blue-100 text-blue-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">
                              {row.cdnProvider}
                            </span>
                          )}
                          {row.wafDetected && (
                            <span className="bg-amber-100 text-amber-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">
                              WAF
                            </span>
                          )}
                          {row.loadBalanced && (
                            <span className="bg-purple-100 text-purple-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">
                              LB
                            </span>
                          )}
                          {!row.cdnProvider && !row.wafDetected && !row.loadBalanced && (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      {/* API */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {row.isApi ? (
                          <span className="bg-indigo-100 text-indigo-700 font-display text-xs font-bold px-1.5 py-0.5 rounded">
                            {row.apiType || 'API'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      {/* Risk */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-white text-xs font-display font-bold ${riskColors[row.risk] || 'bg-gray-400'}`}>
                          {row.risk}
                        </span>
                      </td>
                      {/* Cert status */}
                      <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${certColors[row.cert]}`}>
                        {row.cert}
                      </td>
                      {/* Days left */}
                      <td className="px-3 py-2.5 font-mono font-bold text-center whitespace-nowrap"
                        style={{ color: row.daysLeft === null ? '#94a3b8' : row.daysLeft < 0 ? '#dc2626' : row.daysLeft < 30 ? '#f59e0b' : '#16a34a' }}>
                        {row.daysLeft !== null && row.daysLeft !== undefined ? `${row.daysLeft}d` : '—'}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <button className="p-1 hover:bg-amber-100 rounded transition-colors">
                          <Eye size={13} className="text-pnb-amber" />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${row.id}-detail`} className="bg-indigo-50/40 border-b border-indigo-100 text-gray-800">
                        <td colSpan="14" className="px-5 py-4">
                          <div className="grid grid-cols-4 gap-4 text-xs">
                            {/* SSL Details */}
                            <div className="space-y-1">
                              <p className="font-display font-semibold text-pnb-crimson uppercase text-xs tracking-wide mb-1.5">SSL Details</p>
                              <div className="flex justify-between"><span className="text-gray-500">EV Cert</span><span className="font-semibold">{row.isEV ? '✓ Yes' : '— No'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Wildcard</span><span className="font-semibold">{row.isWildcard ? '✓ Yes' : '— No'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">CT Logged</span><span className="font-semibold">{row.ctLogged ? '✓ Yes' : '— No'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Protocol</span><span className="font-mono font-bold">{row.protocol}</span></div>
                              {row.sans.length > 0 && (
                                <div><span className="text-gray-500">SANs:</span>
                                  <div className="font-mono text-gray-700 mt-0.5 truncate max-w-40">{row.sans.slice(0, 3).join(', ')}</div>
                                </div>
                              )}
                            </div>
                            {/* Network Details */}
                            <div className="space-y-1">
                              <p className="font-display font-semibold text-pnb-crimson uppercase text-xs tracking-wide mb-1.5">Network</p>
                              <div className="flex justify-between"><span className="text-gray-500">IP Address</span><span className="font-mono font-semibold">{row.ipv4}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Subnet (/24)</span><span className="font-mono">{row.subnet}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Port</span><span className="font-mono">{row.port}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Service Type</span><span className="font-semibold">{row.serviceType}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="text-gray-700">{row.portCategory}</span></div>
                            </div>
                            {/* API Details */}
                            {row.isApi && (
                              <div className="space-y-1">
                                <p className="font-display font-semibold text-pnb-crimson uppercase text-xs tracking-wide mb-1.5">API Details</p>
                                <div className="flex justify-between"><span className="text-gray-500">API Type</span><span className="font-semibold text-indigo-700">{row.apiType || 'REST'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Rate Limited</span><span>{row.rateLimited ? '✓ Yes' : '— No'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Versioned</span><span>{row.versioned ? '✓ Yes' : '— No'}</span></div>
                                {row.apiIndicators.length > 0 && (
                                  <div><span className="text-gray-500">Indicators:</span>
                                    {row.apiIndicators.slice(0, 3).map((ind, j) => (
                                      <span key={j} className="block mt-0.5 font-mono text-indigo-600">• {ind}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Infrastructure */}
                            <div className="space-y-1">
                              <p className="font-display font-semibold text-pnb-crimson uppercase text-xs tracking-wide mb-1.5">Infrastructure</p>
                              <div className="flex justify-between"><span className="text-gray-500">CDN</span><span className="font-semibold">{row.cdnProvider || '—'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">WAF</span><span>{row.wafDetected ? 'Detected' : '—'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Load Balanced</span><span>{row.loadBalanced ? '✓ Yes' : '—'}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Web Server</span><span className="font-mono">{row.webServer}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">OS</span><span>{row.detectedOS}</span></div>
                              {row.detectedServices.length > 0 && (
                                <div><span className="text-gray-500">Services:</span>
                                  <span className="ml-1 font-semibold">{row.detectedServices.join(', ')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-amber-100 flex items-center justify-between bg-amber-50/30">
          <p className="font-body text-xs text-gray-500">
            Page {page} of {totalPages} · {filtered.length} assets
            {selected.length > 0 && ` · ${selected.length} selected`}
          </p>
          <div className="flex items-center gap-2 font-display text-xs text-gray-500">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 border border-amber-200 rounded hover:bg-amber-50 disabled:opacity-40">← Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`px-2.5 py-1 rounded font-semibold ${pg === page ? 'bg-pnb-crimson text-white' : 'border border-amber-200 hover:bg-amber-50'}`}>
                  {pg}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 border border-amber-200 rounded hover:bg-amber-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
