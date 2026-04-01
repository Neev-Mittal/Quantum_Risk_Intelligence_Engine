import { useEffect, useMemo, useState } from 'react'
import { Calendar, Search } from 'lucide-react'
import dataAPI from '../dataAPI'
import { formatDiscoveryDate, getIpVersionLabel } from '../utils/assetFormatting'

const BASE_TAB_CONFIG = {
  Domains: { label: 'Domains', subTabs: ['New', 'False Positive', 'Confirmed', 'All'] },
  SSL: { label: 'SSL Certificates', subTabs: ['New', 'False/ignore', 'Confirmed', 'All'] },
  'IP Address/Subnets': { label: 'IP / Subnets', subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
  Software: { label: 'Software', subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
  APIs: { label: 'APIs', subTabs: ['New', 'False or ignore', 'Confirmed', 'All'] },
}

const GRAPH_CANVAS = {
  width: 980,
  height: 560,
}

const GRAPH_NODE_STYLES = {
  hub: { fill: '#7f1d1d', stroke: '#f59e0b', radius: 26 },
  domain: { fill: '#f97316', stroke: '#fed7aa', radius: 18 },
  ssl: { fill: '#2563eb', stroke: '#bfdbfe', radius: 16 },
  ip: { fill: '#0f766e', stroke: '#99f6e4', radius: 16 },
  api: { fill: '#6d28d9', stroke: '#ddd6fe', radius: 16 },
  software: { fill: '#475569', stroke: '#cbd5e1', radius: 16 },
}

function distributePoints(count, x, startY, endY) {
  if (count <= 0) {
    return []
  }

  if (count === 1) {
    return [{ x, y: (startY + endY) / 2 }]
  }

  return Array.from({ length: count }, (_, index) => ({
    x,
    y: startY + ((endY - startY) * index) / (count - 1),
  }))
}

function toLookup(value) {
  return String(value || '').trim().toLowerCase()
}

function shortLabel(value, max = 20) {
  const text = String(value || '')
  if (text.length <= max) {
    return text
  }

  return `${text.slice(0, max - 1)}…`
}

function matchesHost(reference, host) {
  const normalizedReference = toLookup(reference)
  const normalizedHost = toLookup(host)

  if (!normalizedReference || !normalizedHost) {
    return false
  }

  return (
    normalizedReference === normalizedHost ||
    normalizedReference.endsWith(`.${normalizedHost}`) ||
    normalizedHost.endsWith(`.${normalizedReference}`)
  )
}

function recordMatchesSearch(record, searchQuery) {
  if (!searchQuery) {
    return true
  }

  return Object.values(record).some((value) =>
    String(value).toLowerCase().includes(searchQuery.toLowerCase())
  )
}

function buildDiscoveryGraph({ domains, ssls, ips, software, apis, searchQuery }) {
  const filteredDomains = domains.filter((domain) => recordMatchesSearch(domain, searchQuery))
  const selectedDomains = filteredDomains.slice(0, 8)
  const selectedDomainNames = new Set(selectedDomains.map((domain) => toLookup(domain.domain)))

  const relatedSsl = ssls
    .filter((item) => selectedDomains.some((domain) => matchesHost(item.common, domain.domain)))
    .slice(0, 5)

  const relatedApis = apis
    .filter((item) => selectedDomains.some((domain) => matchesHost(item.host, domain.domain)))
    .slice(0, 5)

  const relatedSoftware = software
    .filter((item) => selectedDomains.some((domain) => matchesHost(item.host, domain.domain)))
    .slice(0, 5)

  const candidateIps = []
  ips.forEach((item) => {
    const relatedToDomain = selectedDomains.some((domain) => matchesHost(item.asset, domain.domain))
    const relatedToApi = relatedApis.some((api) => toLookup(api.ip) === toLookup(item.ip))
    if (relatedToDomain || relatedToApi) {
      candidateIps.push(item)
    }
  })

  relatedApis.forEach((api) => {
    if (api.ip && !candidateIps.some((item) => toLookup(item.ip) === toLookup(api.ip))) {
      candidateIps.push({
        ip: api.ip,
        ipVersion: getIpVersionLabel(api.ip),
        subnet: '-',
        ports: api.port || '-',
        asset: api.host,
        serviceType: 'API',
        portCategory: 'web',
        company: api.company,
      })
    }
  })

  const selectedIps = candidateIps.slice(0, 7)

  const nodes = []
  const edges = []

  const hubNode = {
    id: 'hub:pnb',
    label: 'PNB',
    fullLabel: 'Punjab National Bank',
    type: 'hub',
    ...GRAPH_NODE_STYLES.hub,
    x: GRAPH_CANVAS.width / 2,
    y: 72,
  }

  nodes.push(hubNode)

  const domainPoints = distributePoints(selectedDomains.length, 190, 150, 440)
  const sslPoints = distributePoints(relatedSsl.length, 420, 170, 280)
  const ipPoints = distributePoints(selectedIps.length, 790, 160, 440)
  const apiPoints = distributePoints(relatedApis.length, 360, 430, 520)
  const softwarePoints = distributePoints(relatedSoftware.length, 620, 430, 520)

  const domainNodeByName = new Map()
  selectedDomains.forEach((domain, index) => {
    const point = domainPoints[index]
    const node = {
      id: `domain:${domain.domain}`,
      label: shortLabel(domain.domain, 26),
      fullLabel: domain.domain,
      type: 'domain',
      ...GRAPH_NODE_STYLES.domain,
      ...point,
    }
    nodes.push(node)
    domainNodeByName.set(toLookup(domain.domain), node)
    edges.push({ id: `edge:${hubNode.id}:${node.id}`, source: hubNode.id, target: node.id })
  })

  const ipNodeByAddress = new Map()
  selectedIps.forEach((ipRow, index) => {
    const point = ipPoints[index]
    const node = {
      id: `ip:${ipRow.ip}`,
      label: shortLabel(ipRow.ip, 18),
      fullLabel: `${ipRow.ip}${ipRow.ipVersion ? ` (${ipRow.ipVersion})` : ''}`,
      type: 'ip',
      ...GRAPH_NODE_STYLES.ip,
      ...point,
    }
    nodes.push(node)
    ipNodeByAddress.set(toLookup(ipRow.ip), node)

    const relatedDomain = selectedDomains.find((domain) => matchesHost(ipRow.asset, domain.domain))
    if (relatedDomain) {
      const domainNode = domainNodeByName.get(toLookup(relatedDomain.domain))
      if (domainNode) {
        edges.push({ id: `edge:${domainNode.id}:${node.id}`, source: domainNode.id, target: node.id })
      }
    }
  })

  relatedSsl.forEach((sslRow, index) => {
    const point = sslPoints[index]
    const node = {
      id: `ssl:${sslRow.common}:${index}`,
      label: shortLabel(sslRow.common, 20),
      fullLabel: sslRow.common,
      type: 'ssl',
      ...GRAPH_NODE_STYLES.ssl,
      ...point,
    }
    nodes.push(node)

    const relatedDomain = selectedDomains.find((domain) => matchesHost(sslRow.common, domain.domain))
    if (relatedDomain) {
      const domainNode = domainNodeByName.get(toLookup(relatedDomain.domain))
      if (domainNode) {
        edges.push({ id: `edge:${domainNode.id}:${node.id}`, source: domainNode.id, target: node.id })
      }
    }
  })

  relatedApis.forEach((apiRow, index) => {
    const point = apiPoints[index]
    const node = {
      id: `api:${apiRow.host}:${index}`,
      label: shortLabel(apiRow.host, 18),
      fullLabel: apiRow.host,
      type: 'api',
      ...GRAPH_NODE_STYLES.api,
      ...point,
    }
    nodes.push(node)

    const relatedDomain = selectedDomains.find((domain) => matchesHost(apiRow.host, domain.domain))
    if (relatedDomain) {
      const domainNode = domainNodeByName.get(toLookup(relatedDomain.domain))
      if (domainNode) {
        edges.push({ id: `edge:${domainNode.id}:${node.id}`, source: domainNode.id, target: node.id })
      }
    }

    const ipNode = ipNodeByAddress.get(toLookup(apiRow.ip))
    if (ipNode) {
      edges.push({ id: `edge:${node.id}:${ipNode.id}`, source: node.id, target: ipNode.id })
    }
  })

  relatedSoftware.forEach((softwareRow, index) => {
    const point = softwarePoints[index]
    const node = {
      id: `software:${softwareRow.host}:${softwareRow.product}:${index}`,
      label: shortLabel(softwareRow.product, 18),
      fullLabel: `${softwareRow.product} on ${softwareRow.host}`,
      type: 'software',
      ...GRAPH_NODE_STYLES.software,
      ...point,
    }
    nodes.push(node)

    const relatedDomain = selectedDomains.find((domain) => matchesHost(softwareRow.host, domain.domain))
    if (relatedDomain) {
      const domainNode = domainNodeByName.get(toLookup(relatedDomain.domain))
      if (domainNode) {
        edges.push({ id: `edge:${domainNode.id}:${node.id}`, source: domainNode.id, target: node.id })
      }
    }
  })

  return {
    nodes,
    edges,
    counts: {
      domains: selectedDomains.length,
      ssl: relatedSsl.length,
      ips: selectedIps.length,
      apis: relatedApis.length,
      software: relatedSoftware.length,
    },
  }
}

function CipherBadge({ strength }) {
  const cls =
    strength === 'Strong'
      ? 'bg-green-100 text-green-700'
      : strength === 'Moderate'
      ? 'bg-amber-100 text-amber-700'
      : strength === 'Weak'
      ? 'bg-red-100 text-red-700'
      : 'bg-gray-100 text-gray-400'

  return <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${cls}`}>{strength || '-'}</span>
}

function DaysLeftBadge({ days }) {
  if (days === null || days === undefined) return <span className="text-gray-400">-</span>

  const color = days < 0 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-green-600'
  const label = days < 0 ? `${Math.abs(days)}d ago` : `${days}d`
  return <span className={`font-mono font-bold ${color}`}>{label}</span>
}

function PreviewPanel({ preview }) {
  if (!preview) {
    return null
  }

  return (
    <aside className="glass-card rounded-xl border border-amber-200/80 p-4 xl:sticky xl:top-4 h-fit">
      <div className="border-b border-amber-100 pb-3">
        <p className="font-display text-[11px] uppercase tracking-[0.22em] text-pnb-crimson">{preview.section}</p>
        <h3 className="mt-2 break-all font-display text-sm font-bold text-slate-800">{preview.title}</h3>
        <p className="mt-1 text-xs text-slate-500">{preview.subtitle}</p>
      </div>

      <div className="mt-4 space-y-3">
        {preview.fields.map((field) => (
          <div key={field.label} className="rounded-xl border border-amber-100 bg-white/80 px-3 py-2">
            <p className="font-body text-[11px] uppercase tracking-wide text-slate-400">{field.label}</p>
            <p className="mt-1 break-words text-sm font-medium text-slate-700">{field.value || '-'}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}

function buildPreview(tab, row) {
  if (!row) {
    return null
  }

  if (tab === 'Domains') {
    return {
      section: 'Hover Preview',
      title: row.domain,
      subtitle: 'Domain discovery record',
      fields: [
        { label: 'Detection Date', value: formatDiscoveryDate(row.detected) },
        { label: 'Registration Date', value: row.registered || '-' },
        { label: 'Registrar', value: row.registrar || '-' },
        { label: 'Company', value: row.company || '-' },
      ],
    }
  }

  if (tab === 'SSL') {
    return {
      section: 'Hover Preview',
      title: row.common,
      subtitle: 'Certificate details',
      fields: [
        { label: 'Protocol', value: row.protocol || '-' },
        { label: 'Cipher Strength', value: row.cipherStrength || '-' },
        { label: 'Validity', value: `${row.validFrom || '-'} to ${row.validTo || '-'}` },
        { label: 'Days Left', value: row.daysLeft === null || row.daysLeft === undefined ? '-' : `${row.daysLeft}` },
        { label: 'Certificate Authority', value: row.authority || '-' },
        { label: 'SANs', value: row.sans || '-' },
      ],
    }
  }

  if (tab === 'IP Address/Subnets') {
    return {
      section: 'Hover Preview',
      title: row.asset || row.ip,
      subtitle: 'IP and subnet mapping',
      fields: [
        { label: 'IP Address', value: row.ip || '-' },
        { label: 'IP Type', value: row.ipVersion || getIpVersionLabel(row.ip) || '-' },
        { label: 'Detection Date', value: formatDiscoveryDate(row.detected) },
        { label: 'Ports', value: row.ports || '-' },
        { label: 'Subnet', value: row.subnet || '-' },
        { label: 'Service Type', value: row.serviceType || '-' },
        { label: 'Port Category', value: row.portCategory || '-' },
      ],
    }
  }

  if (tab === 'Software') {
    return {
      section: 'Hover Preview',
      title: row.product,
      subtitle: `Host ${row.host || '-'}`,
      fields: [
        { label: 'Version', value: row.version || '-' },
        { label: 'Type', value: row.type || '-' },
        { label: 'Port', value: row.port || '-' },
        { label: 'Detection Date', value: formatDiscoveryDate(row.detected) },
        { label: 'Company', value: row.company || '-' },
      ],
    }
  }

  return {
    section: 'Hover Preview',
    title: row.host,
    subtitle: 'API endpoint details',
    fields: [
      { label: 'IP Address', value: row.ip || '-' },
      { label: 'IP Type', value: getIpVersionLabel(row.ip) || '-' },
      { label: 'Port', value: row.port || '-' },
      { label: 'API Type', value: row.apiType || '-' },
      { label: 'Rate Limited', value: row.rateLimited || '-' },
      { label: 'Versioned', value: row.versioned || '-' },
      { label: 'CDN Provider', value: row.cdnProvider || '-' },
      { label: 'WAF', value: row.waf || '-' },
    ],
  }
}

export default function AssetDiscovery() {
  const [mainTab, setMainTab] = useState('Domains')
  const [subTabIdx, setSubTabIdx] = useState(3)
  const [showGraph, setShowGraph] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [hoveredAsset, setHoveredAsset] = useState(null)

  const [domainData, setDomainData] = useState({ New: [], 'False Positive': [], Confirmed: [], All: [] })
  const [sslData, setSslData] = useState({ New: [], 'False/ignore': [], Confirmed: [], All: [] })
  const [ipData, setIpData] = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })
  const [softwareData, setSoftwareData] = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })
  const [apiData, setApiData] = useState({ New: [], 'False or ignore': [], Confirmed: [], All: [] })

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

  useEffect(() => {
    setHoveredAsset(null)
  }, [mainTab, subTabIdx])

  const subTabs = BASE_TAB_CONFIG[mainTab].subTabs
  const subKey = subTabs[subTabIdx].split(' (')[0].replace(/\s*\(\d+\)/, '').trim()

  const getRows = () => {
    const map = {
      Domains: domainData,
      SSL: sslData,
      'IP Address/Subnets': ipData,
      Software: softwareData,
      APIs: apiData,
    }

    return map[mainTab]?.[subKey] || map[mainTab]?.All || []
  }

  const rows = getRows().filter((row) => {
    if (!searchQuery) {
      return true
    }

    return Object.values(row).some((value) =>
      String(value).toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const graphData = useMemo(
    () =>
      buildDiscoveryGraph({
        domains: domainData.All || [],
        ssls: sslData.All || [],
        ips: ipData.All || [],
        software: softwareData.All || [],
        apis: apiData.All || [],
        searchQuery,
      }),
    [apiData.All, domainData.All, ipData.All, searchQuery, softwareData.All, sslData.All]
  )

  const activePreview = useMemo(() => {
    if (hoveredAsset) {
      return hoveredAsset
    }

    return rows.length > 0 ? buildPreview(mainTab, rows[0]) : null
  }, [hoveredAsset, mainTab, rows])

  const getRowHandlers = (row) => ({
    onMouseEnter: () => setHoveredAsset(buildPreview(mainTab, row)),
    onFocus: () => setHoveredAsset(buildPreview(mainTab, row)),
    onClick: () => setHoveredAsset(buildPreview(mainTab, row)),
  })

  const renderTable = () => {
    if (mainTab === 'Domains') {
      return (
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
              {['Detection Date', 'Domain Name', 'Registration Date', 'Registrar', 'Company'].map((header) => (
                <th key={header} className="px-4 py-3 text-left font-display font-semibold tracking-wide">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.domain}-${index}`}
                {...getRowHandlers(row)}
                className={`cursor-pointer border-b border-amber-50 transition-colors hover:bg-amber-50 ${
                  index % 2 === 0 ? 'bg-white/80' : 'bg-red-50/20'
                }`}
              >
                <td className="px-4 py-3 text-gray-700">{formatDiscoveryDate(row.detected)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-blue-700">{row.domain}</td>
                <td className="px-4 py-3 text-gray-700">{row.registered}</td>
                <td className="px-4 py-3 text-gray-600">{row.registrar}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{row.company}</td>
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
              {['Common Name', 'Valid From', 'Valid To', 'Days Left', 'Cipher Str.', 'Protocol', 'EV', 'Wildcard', 'CT', 'SANs', 'CA'].map((header) => (
                <th key={header} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.common}-${index}`}
                {...getRowHandlers(row)}
                className={`cursor-pointer border-b border-amber-50 transition-colors hover:bg-amber-50 ${
                  index % 2 === 0 ? 'bg-white/80' : 'bg-red-50/20'
                }`}
              >
                <td className="px-3 py-2.5 max-w-40 truncate font-mono font-semibold text-blue-700" title={row.common}>
                  {row.common}
                </td>
                <td className="px-3 py-2.5 text-gray-600">{row.validFrom}</td>
                <td className="px-3 py-2.5 text-gray-600">{row.validTo}</td>
                <td className="px-3 py-2.5"><DaysLeftBadge days={row.daysLeft} /></td>
                <td className="px-3 py-2.5"><CipherBadge strength={row.cipherStrength} /></td>
                <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{row.protocol || '-'}</td>
                <td className="px-3 py-2.5 text-center">{row.isEV ? <span className="font-bold text-green-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5 text-center">{row.isWildcard ? <span className="font-bold text-amber-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5 text-center">{row.ctLogged ? <span className="font-bold text-blue-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5 max-w-36 truncate font-mono text-gray-500" title={row.sans}>{row.sans || '-'}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-blue-100 px-2 py-0.5 font-display text-xs font-bold text-blue-700">
                    {row.authority}
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
              {['Detection Date', 'IP Address', 'Port', 'Subnet', 'Service Type', 'Port Category', 'ASN', 'Company'].map((header) => (
                <th key={header} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.ip}-${index}`}
                {...getRowHandlers(row)}
                className={`cursor-pointer border-b border-amber-50 transition-colors hover:bg-amber-50 ${
                  index % 2 === 0 ? 'bg-white/80' : 'bg-red-50/20'
                }`}
              >
                <td className="px-3 py-2.5 text-gray-700">{formatDiscoveryDate(row.detected)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-blue-700">{row.ip}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {(row.ipVersion || getIpVersionLabel(row.ip) || 'IP').replace('IPv', 'v')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono font-bold text-amber-700">{row.ports}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-normal break-all font-mono text-gray-600">{row.subnet || '-'}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 font-display text-xs font-bold text-purple-700">
                    {row.serviceType || '-'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{row.portCategory || '-'}</td>
                <td className="px-3 py-2.5 font-display font-bold text-pnb-crimson">{row.asn}</td>
                <td className="px-3 py-2.5 font-display font-semibold text-pnb-crimson">{row.company}</td>
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
              {['Detection Date', 'Product', 'Version', 'Type', 'Port', 'Host', 'Company'].map((header) => (
                <th key={header} className="px-4 py-3 text-left font-display font-semibold tracking-wide">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.product}-${row.host}-${index}`}
                {...getRowHandlers(row)}
                className={`cursor-pointer border-b border-amber-50 transition-colors hover:bg-amber-50 ${
                  index % 2 === 0 ? 'bg-white/80' : 'bg-red-50/20'
                }`}
              >
                <td className="px-4 py-3 text-gray-700">{formatDiscoveryDate(row.detected)}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{row.product}</td>
                <td className="px-4 py-3 font-mono text-gray-600">{row.version}</td>
                <td className="px-4 py-3 text-gray-700">{row.type}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-purple-100 px-2 py-0.5 font-mono font-bold text-purple-700">{row.port}</span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{row.host}</td>
                <td className="px-4 py-3 font-display font-bold text-pnb-crimson">{row.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    return (
      <table className="w-full text-xs font-body">
        <thead>
          <tr className="bg-gradient-to-r from-indigo-800 to-purple-800 text-white">
            {['Host / Endpoint', 'IP', 'Port', 'API Type', 'Rate Limited', 'Versioned', 'CDN Provider', 'WAF', 'Detection Indicators', 'Company'].map((header) => (
              <th key={header} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">
                {header}
              </th>
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
          ) : (
            rows.map((row, index) => (
              <tr
                key={`${row.host}-${index}`}
                {...getRowHandlers(row)}
                className={`cursor-pointer border-b border-indigo-50 transition-colors hover:bg-indigo-50/30 ${
                  index % 2 === 0 ? 'bg-white/80' : 'bg-indigo-50/20'
                }`}
              >
                <td className="px-3 py-2.5 max-w-36 truncate font-mono font-bold text-indigo-700" title={row.host}>{row.host}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-gray-600">{row.ip}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {(getIpVersionLabel(row.ip) || 'IP').replace('IPv', 'v')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 font-mono font-bold text-purple-700">{row.port}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-indigo-100 px-2 py-0.5 font-display text-xs font-bold text-indigo-700">
                    {row.apiType || 'REST'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">{row.rateLimited && row.rateLimited !== '-' ? <span className="font-bold text-green-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5 text-center">{row.versioned && row.versioned !== '-' ? <span className="font-bold text-blue-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5">
                  {row.cdnProvider && row.cdnProvider !== '-'
                    ? <span className="rounded bg-blue-100 px-1.5 py-0.5 font-display text-xs font-bold text-blue-700">{row.cdnProvider}</span>
                    : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-3 py-2.5 text-center">{row.waf && row.waf !== '-' ? <span className="font-bold text-amber-600">Yes</span> : <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2.5 max-w-56 truncate text-gray-500" title={row.indicators}>{row.indicators || '-'}</td>
                <td className="px-3 py-2.5 font-display font-bold text-pnb-crimson">{row.company}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    )
  }

  const GraphView = () => (
    <div className="glass-card relative overflow-hidden rounded-xl border border-amber-200/80 bg-[radial-gradient(circle_at_top,_rgba(255,247,237,0.95),_rgba(255,255,255,0.9)_42%,_rgba(255,251,235,0.95)_100%)] p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson">
            Asset Relationship Graph
          </p>
          <p className="mt-1 font-body text-xs text-slate-500">
            Real discovery records are mapped into domains, SSL, IPs, APIs, and software relationships.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            ['Domains', graphData.counts.domains, GRAPH_NODE_STYLES.domain.fill],
            ['SSL', graphData.counts.ssl, GRAPH_NODE_STYLES.ssl.fill],
            ['IPs', graphData.counts.ips, GRAPH_NODE_STYLES.ip.fill],
            ['APIs', graphData.counts.apis, GRAPH_NODE_STYLES.api.fill],
            ['Software', graphData.counts.software, GRAPH_NODE_STYLES.software.fill],
          ].map(([label, count, color]) => (
            <div key={label} className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
              <p className="font-display text-sm font-bold" style={{ color }}>{count}</p>
              <p className="font-body text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {graphData.nodes.length <= 1 ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 px-6 py-12 text-center">
          <p className="font-display text-sm font-semibold text-pnb-crimson">No graphable discovery relationships yet</p>
          <p className="mt-2 font-body text-xs text-slate-500">
            Run discovery or clear the current search filter to populate the relationship view.
          </p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${GRAPH_CANVAS.width} ${GRAPH_CANVAS.height}`}
          className="h-[540px] w-full rounded-xl border border-amber-100/70 bg-gradient-to-b from-white/80 via-amber-50/40 to-white/80"
          role="img"
          aria-label="Asset discovery relationship graph"
        >
          {graphData.edges.map((edge) => {
            const source = graphData.nodes.find((node) => node.id === edge.source)
            const target = graphData.nodes.find((node) => node.id === edge.target)

            if (!source || !target) {
              return null
            }

            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#c2410c"
                strokeOpacity="0.28"
                strokeWidth="2"
              />
            )
          })}

          {graphData.nodes.map((node) => {
            const labelWidth = Math.max(72, Math.min(168, node.fullLabel.length * 6.5))
            const labelY = node.y + node.radius + 10

            return (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r={node.radius} fill={node.fill} stroke={node.stroke} strokeWidth="3" />
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fontFamily="Oxanium"
                  fontSize={node.type === 'hub' ? '12' : '10'}
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {node.type === 'hub' ? 'PNB' : node.type.toUpperCase().slice(0, 3)}
                </text>

                <rect
                  x={node.x - labelWidth / 2}
                  y={labelY}
                  width={labelWidth}
                  height="24"
                  rx="12"
                  fill="rgba(255,255,255,0.94)"
                  stroke="rgba(148,163,184,0.32)"
                />
                <text
                  x={node.x}
                  y={labelY + 16}
                  textAnchor="middle"
                  fontFamily="DM Sans"
                  fontSize="11"
                  fontWeight="600"
                  fill="#0f172a"
                >
                  {node.label}
                </text>
                <title>{node.fullLabel}</title>
              </g>
            )
          })}
        </svg>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-body">
        {[
          ['Hub', GRAPH_NODE_STYLES.hub.fill],
          ['Domains', GRAPH_NODE_STYLES.domain.fill],
          ['SSL', GRAPH_NODE_STYLES.ssl.fill],
          ['IPs', GRAPH_NODE_STYLES.ip.fill],
          ['APIs', GRAPH_NODE_STYLES.api.fill],
          ['Software', GRAPH_NODE_STYLES.software.fill],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm">
            <div className="h-3 w-3 rounded-full" style={{ background: color }} />
            <span className="text-slate-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const SearchView = () => (
    <div className="glass-card mx-auto mt-4 max-w-2xl rounded-xl p-8">
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search domain, URL, IP, SSL fingerprint..."
          className="w-full rounded-xl border-2 border-amber-300 bg-amber-50 py-3 pl-11 pr-4 font-body text-sm text-pnb-crimson placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-amber-600" />
          <span className="font-display text-sm font-semibold text-pnb-crimson">Time Period</span>
        </div>
        <p className="mb-3 font-body text-xs text-gray-500">Specify the period for data</p>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateStart}
            onChange={(event) => setDateStart(event.target.value)}
            className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-body focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <span className="font-display font-bold text-pnb-crimson">to</span>
          <input
            type="date"
            className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-body focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
        <button className="mt-4 rounded-lg bg-gradient-to-r from-pnb-gold to-pnb-amber px-6 py-2 font-display text-xs font-semibold text-white transition-all duration-300 hover:from-pnb-amber hover:to-pnb-crimson">
          Search
        </button>
      </div>
    </div>
  )

  const getCount = (tab) => {
    const map = {
      Domains: domainData,
      SSL: sslData,
      'IP Address/Subnets': ipData,
      Software: softwareData,
      APIs: apiData,
    }

    return map[tab]?.All?.length || 0
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Asset Discovery</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGraph(!showGraph)}
            className={`rounded-lg px-4 py-2 font-display text-xs font-semibold transition-colors ${
              showGraph === true
                ? 'bg-pnb-crimson text-white'
                : 'border border-amber-300 bg-white text-pnb-amber hover:bg-amber-50'
            }`}
          >
            {showGraph === true ? 'Table View' : 'Graph View'}
          </button>
          <button
            onClick={() => setShowGraph('search')}
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-display text-xs font-semibold text-pnb-amber transition-colors hover:bg-amber-50"
          >
            <Search size={12} className="mr-1 inline" />
            Search IoC
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(BASE_TAB_CONFIG).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setMainTab(tab)
              setSubTabIdx(0)
            }}
            className={`rounded-xl px-5 py-2.5 font-display text-xs font-semibold transition-all duration-200 ${
              mainTab === tab
                ? 'bg-gradient-to-r from-pnb-crimson to-red-700 text-white shadow-lg shadow-red-200'
                : 'border border-amber-200 bg-white/80 text-gray-600 hover:bg-amber-50'
            }`}
          >
            {BASE_TAB_CONFIG[tab].label} ({getCount(tab)})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          {subTabs.map((subTab, index) => {
            const map = {
              Domains: domainData,
              SSL: sslData,
              'IP Address/Subnets': ipData,
              Software: softwareData,
              APIs: apiData,
            }
            const count = map[mainTab]?.[subTab]?.length || 0

            return (
              <button
                key={subTab}
                onClick={() => setSubTabIdx(index)}
                className={`rounded-lg px-4 py-2 font-display text-xs font-semibold transition-all ${
                  subTabIdx === index
                    ? 'bg-amber-500 text-white'
                    : 'border border-amber-200 bg-white/70 text-gray-600 hover:bg-amber-50'
                }`}
              >
                {subTab} ({count})
              </button>
            )
          })}
        </div>

        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter results..."
            className="w-40 rounded-lg border border-amber-200 bg-white py-1.5 pl-8 pr-3 font-body text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {showGraph === 'search' ? (
        <SearchView />
      ) : showGraph === true ? (
        <GraphView />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="glass-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-amber-100 bg-white/50 px-4 py-3">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-pnb-crimson">
                Discovery Results
              </p>
              <p className="font-body text-xs text-gray-500">
                Hover or click a row to inspect the asset details
              </p>
            </div>

            <div className="overflow-x-auto">
              {rows.length > 0 ? (
                renderTable()
              ) : (
                <div className="p-8 text-center font-body text-sm text-gray-400">
                  No data for this tab yet. Run a scan to populate asset discovery records.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-amber-100 bg-amber-50/30 px-4 py-2">
              <span className="font-body text-xs text-gray-500">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <PreviewPanel preview={activePreview} />
        </div>
      )}
    </div>
  )
}
