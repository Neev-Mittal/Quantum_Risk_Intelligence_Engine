import { useState, useEffect, useRef } from 'react'
import dataAPI from '../dataAPI'
import {
  Users, Calendar, Search, Download,
  Mail, FolderOpen, Link2, Bell, Plus, ChevronDown,
  Check, X, Loader2, FileText, AlertCircle
} from 'lucide-react'

// ── Report API helper ─────────────────────────────────────────────────────────
const REPORT_API = '/api/reports'

async function apiPost(endpoint, body) {
  const res = await fetch(`${REPORT_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

async function downloadReport(reportTypes, format) {
  const res = await apiPost('/generate', { report_types: reportTypes, format })
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : `QRIE_Report.${format === 'cyclonedx' ? 'json' : format}`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── All available report types ────────────────────────────────────────────────
const ALL_REPORT_TYPES = [
  { key: 'Executive Summary Report', icon: '📊', label: 'Executive Summary' },
  { key: 'Asset Discovery Report',   icon: '🔍', label: 'Asset Discovery' },
  { key: 'Asset Inventory Report',   icon: '🗂', label: 'Asset Inventory' },
  { key: 'CBOM Report',              icon: '📋', label: 'CBOM' },
  { key: 'PQC Posture Report',       icon: '🛡', label: 'PQC Posture' },
  { key: 'Cyber Rating Report',      icon: '⭐', label: 'Cyber Rating' },
]

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null
  const colors = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    loading: 'bg-amber-600',
    info:    'bg-blue-600',
  }
  const icons = {
    success: <Check size={16} />,
    error:   <AlertCircle size={16} />,
    loading: <Loader2 size={16} className="animate-spin" />,
    info:    <FileText size={16} />,
  }
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`${colors[toast.type] || colors.info} text-white rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 min-w-[300px]`}>
        {icons[toast.type]}
        <span className="font-body text-sm flex-1">{toast.message}</span>
        {toast.type !== 'loading' && (
          <button onClick={onDismiss} className="hover:bg-white/20 rounded-full p-0.5">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Reporting Component ──────────────────────────────────────────────────
export default function Reporting() {
  const [active, setActive] = useState(null)
  const [stats, setStats] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (type, message, duration = 4000) => {
    setToast({ type, message })
    if (type !== 'loading') {
      setTimeout(() => setToast(null), duration)
    }
  }

  useEffect(() => {
    Promise.all([
      dataAPI.getDashboardData(),
      dataAPI.getCBOMData(),
      dataAPI.getPostureOfPQCData(),
      dataAPI.getCyberRatingData()
    ]).then(([dash, cbom, pqc, rating]) => {
      setStats({
        dash: dash.success ? dash : {},
        cbom: cbom.success ? cbom : {},
        pqc: pqc.success ? pqc : { summary: {} },
        rating: rating.success ? rating : {}
      })
    })
  }, [])

  if (active === null) {
    return (
      <>
        <SelectionView setActive={setActive} />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    )
  }
  if (active === 'scheduled') {
    return (
      <>
        <ScheduledView setActive={setActive} showToast={showToast} />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    )
  }
  if (active === 'ondemand') {
    return (
      <>
        <OnDemandView setActive={setActive} showToast={showToast} />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    )
  }
  return (
    <>
      <ExecView setActive={setActive} stats={stats} showToast={showToast} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

// ── Landing selection ─────────────────────────────────────────────────────────
function SelectionView({ setActive }) {
  const cards = [
    {
      icon: Users, label: 'Executives Reporting', key: 'exec',
      desc: 'Board-level risk summaries, Q-VaR models, and KPI dashboards for CISO/CTO.',
      color: 'from-blue-600 to-blue-800',
    },
    {
      icon: Calendar, label: 'Scheduled Reporting', key: 'scheduled',
      desc: 'Automate periodic report generation and delivery to email or storage locations.',
      color: 'from-pnb-crimson to-red-900',
    },
    {
      icon: Search, label: 'On-Demand Reporting', key: 'ondemand',
      desc: 'Generate targeted reports on request for specific assets, incidents, or audits.',
      color: 'from-amber-500 to-amber-700',
    },
  ]

  return (
    <div className="space-y-5">
      <h1 className="font-display text-xl font-bold text-pnb-crimson">Reporting</h1>

      <div className="flex justify-center items-center min-h-80">
        <div className="grid grid-cols-3 gap-6 max-w-4xl w-full">
          {cards.map(({ icon: Icon, label, key, desc, color }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className="group relative overflow-hidden rounded-3xl p-8 text-center
                         shadow-xl hover:shadow-2xl transition-all duration-300
                         hover:-translate-y-2 cursor-pointer"
            >
              {/* Background */}
              <div className={`absolute inset-0 bg-gradient-to-b ${color} opacity-90`} />
              {/* Oval outline */}
              <div className="absolute inset-4 border-2 border-white/20 rounded-2xl" />

              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon size={32} className="text-white" />
                </div>
                <p className="font-display text-lg font-bold text-white mb-2">{label}</p>
                <p className="font-body text-xs text-white/80">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Executive Reporting ───────────────────────────────────────────────────────
function ExecView({ setActive, stats, showToast }) {
  const [downloading, setDownloading] = useState(null)

  if (!stats) return <div className="p-8 text-pnb-crimson animate-pulse">Aggregating executive metrics...</div>

  const tiles = [
    {
      title: 'Assets Discovery',
      items: [
        `${stats.dash.statCards?.[0]?.value || 0} Total subdomains & IPs`,
        `${stats.dash.statCards?.[1]?.value || 0} Public Web Applications`
      ],
      icon: '🔍', color: 'bg-blue-50 border-blue-200'
    },
    {
      title: 'Cyber Rating',
      items: [
        `Consolidated Score: ${stats.rating.enterpriseScore || 0}`,
        `Current Tier: ${stats.rating.enterpriseTier || 'Unknown'}`
      ],
      icon: '⭐', color: 'bg-amber-50 border-amber-200'
    },
    {
      title: 'Assets Inventory',
      items: [
        `Active Certificates: ${stats.cbom.stats?.activeCerts || 0}`,
        `Weak Crypto Found: ${stats.cbom.stats?.weakCrypto || 0}`
      ],
      icon: '🗂', color: 'bg-green-50 border-green-200'
    },
    {
      title: 'Posture of PQC',
      items: [
        `Elite-PQC Ready: ${stats.pqc.summary?.pqcReadyPct || 0}%`,
        `Legacy Protocol Count: ${stats.pqc.summary?.legacyPct || 0}%`
      ],
      icon: '🛡', color: 'bg-purple-50 border-purple-200'
    },
    {
      title: 'CBOM',
      items: [
        `Total Assets Analyzed: ${stats.cbom.stats?.totalApps || 0}`,
        `Certificate/Cipher Issues: ${stats.cbom.stats?.certIssues || 0}`
      ],
      icon: '📋', color: 'bg-orange-50 border-orange-200'
    },
  ]

  const downloadButtons = [
    { label: 'Executive Summary (PDF)',     reportType: 'Executive Summary Report', format: 'pdf' },
    { label: 'Risk Assessment (JSON)',      reportType: 'PQC Posture Report',       format: 'json' },
    { label: 'Asset Inventory (CSV)',       reportType: 'Asset Inventory Report',   format: 'csv' },
    { label: 'CBOM Report (CycloneDX)',     reportType: 'CBOM Report',             format: 'cyclonedx' },
  ]

  const handleDownload = async (btn) => {
    const key = btn.label
    setDownloading(key)
    showToast('loading', `Generating ${btn.label}...`)
    try {
      await downloadReport([btn.reportType], btn.format)
      showToast('success', `${btn.label} downloaded successfully!`)
    } catch (err) {
      showToast('error', `Failed to generate report: ${err.message}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActive(null)}
          className="font-display text-xs text-pnb-amber hover:text-pnb-crimson">← Back</button>
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Executive Reporting</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {tiles.map(({ title, items, icon, color }) => (
          <div key={title} className={`glass-card rounded-xl p-4 border ${color}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{icon}</span>
              <h3 className="font-display text-xs font-semibold text-gray-800">{title}</h3>
            </div>
            {items.map((item, i) => (
              <p key={i} className="font-body text-xs text-gray-600 mt-1">{item}</p>
            ))}
          </div>
        ))}

        {/* Download buttons */}
        <div className="glass-card rounded-xl p-4 border border-amber-200">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson mb-3">Download Reports</h3>
          {downloadButtons.map(btn => (
            <button key={btn.label}
              onClick={() => handleDownload(btn)}
              disabled={downloading === btn.label}
              className={`w-full flex items-center justify-between text-xs font-body
                         py-2 px-3 mb-1.5 bg-white border border-amber-200 rounded-lg
                         hover:bg-amber-50 text-gray-700 transition-colors
                         ${downloading === btn.label ? 'opacity-60 cursor-wait' : ''}`}>
              {btn.label}
              {downloading === btn.label
                ? <Loader2 size={12} className="text-pnb-amber animate-spin" />
                : <Download size={12} className="text-pnb-amber" />
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Multi-select report type chips ────────────────────────────────────────────
function ReportTypeMultiSelect({ selected, setSelected }) {
  return (
    <div>
      <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
        Report Types <span className="text-gray-400 font-normal">(select multiple)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {ALL_REPORT_TYPES.map(({ key, icon, label }) => {
          const isSelected = selected.includes(key)
          return (
            <button
              key={key}
              onClick={() => {
                setSelected(prev =>
                  prev.includes(key)
                    ? prev.filter(k => k !== key)
                    : [...prev, key]
                )
              }}
              className={`flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200
                ${isSelected
                  ? 'bg-pnb-crimson text-white border-pnb-crimson shadow-md scale-[1.02]'
                  : 'bg-white text-gray-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'
                }`}
            >
              {isSelected && <Check size={12} />}
              <span>{icon}</span>
              {label}
            </button>
          )
        })}
      </div>
      {selected.length > 1 && (
        <p className="font-body text-xs text-amber-700 mt-2 flex items-center gap-1">
          <FileText size={12} />
          {selected.length} report types selected — will be merged into a single consolidated report
        </p>
      )}
    </div>
  )
}

// ── Scheduled Reporting ───────────────────────────────────────────────────────
function ScheduledView({ setActive, showToast }) {
  const [enabled, setEnabled] = useState(true)
  const [freq, setFreq]       = useState('Weekly')
  const [assets, setAssets]   = useState('All Assets')
  const [selectedTypes, setSelectedTypes] = useState(['Executive Summary Report'])
  const [scheduleDate, setScheduleDate]   = useState('2026-04-25')
  const [scheduleTime, setScheduleTime]   = useState('09:00 AM (IST)')
  const [submitting, setSubmitting]       = useState(false)
  const [format, setFormat] = useState('PDF')

  const sections = ['Discovery', 'Inventory', 'CBOM', 'PQC Posture', 'Cyber Rating']
  const [checked, setChecked] = useState(new Set(sections))

  const toggleSection = s => {
    setChecked(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  // Delivery state
  const [emailOn, setEmailOn]     = useState(true)
  const [emailAddr, setEmailAddr] = useState('')
  const [saveOn, setSaveOn]       = useState(true)
  const [savePath, setSavePath]   = useState('/Reports/Quarterly/')
  const [linkOn, setLinkOn]       = useState(false)

  const handleSchedule = async () => {
    if (selectedTypes.length === 0) {
      showToast('error', 'Please select at least one report type')
      return
    }
    setSubmitting(true)
    showToast('loading', 'Saving schedule...')
    try {
      const res = await apiPost('/schedule', {
        report_types: selectedTypes,
        format: format.toLowerCase(),
        frequency: freq,
        schedule_date: scheduleDate,
        schedule_time: scheduleTime,
        assets_scope: assets,
        sections: Array.from(checked),
        include_charts: true,
        password_protect: false,
        delivery_email: emailOn ? emailAddr : null,
        delivery_save_path: saveOn ? savePath : null,
        delivery_link: linkOn,
        enabled,
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', `Schedule created: ${freq} ${selectedTypes.length > 1 ? 'consolidated' : selectedTypes[0]}`)
      } else {
        showToast('error', data.detail || 'Failed to save schedule')
      }
    } catch (err) {
      showToast('error', `Error: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActive(null)}
          className="font-display text-xs text-pnb-amber hover:text-pnb-crimson">← Back</button>
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Schedule Reporting</h1>
      </div>

      <div className="glass-card rounded-2xl p-6 max-w-3xl mx-auto shadow-xl">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl"><Calendar size={20} className="text-pnb-amber" /></div>
            <h2 className="font-display text-lg font-bold text-pnb-crimson">Schedule Reporting</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-body text-xs text-gray-600">Enable Schedule</span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-amber-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Left */}
          <div className="space-y-4">
            {/* Multi-select report types */}
            <ReportTypeMultiSelect selected={selectedTypes} setSelected={setSelectedTypes} />

            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                Frequency
              </label>
              <select value={freq} onChange={e => setFreq(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body text-gray-800
                           focus:outline-none focus:ring-1 focus:ring-amber-400">
                {['Daily','Weekly','Bi-Weekly','Monthly','Quarterly'].map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                Select Assets
              </label>
              <select value={assets} onChange={e => setAssets(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body text-gray-800
                           focus:outline-none focus:ring-1 focus:ring-amber-400">
                {['All Assets','Web Applications','APIs','Servers','Gateways'].map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                File Format
              </label>
              <select value={format} onChange={e => setFormat(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body text-gray-800
                           focus:outline-none focus:ring-1 focus:ring-amber-400">
                {['PDF','JSON','CSV','XLSX','CycloneDX'].map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
                Include Sections
              </label>
              <div className="flex flex-wrap gap-2">
                {sections.map(s => (
                  <button key={s} onClick={() => toggleSection(s)}
                    className={`flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-lg border transition-colors
                      ${checked.has(s) ? 'bg-pnb-crimson text-white border-pnb-crimson shadow-sm' : 'bg-white text-gray-600 border-amber-200 hover:bg-amber-50'}`}>
                    {checked.has(s) && '✓'} {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-600 mb-3">
                <Calendar size={14} />
                <span className="font-display text-xs font-semibold uppercase tracking-wide">Schedule Details</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="font-body text-xs text-gray-600 block mb-1">Date</label>
                  <input type="date" value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body text-gray-800
                               focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="font-body text-xs text-gray-600 block mb-1">Time</label>
                  <select value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body text-gray-800
                                    focus:outline-none focus:ring-1 focus:ring-amber-400">
                    {['09:00 AM (IST)','12:00 PM (IST)','06:00 PM (IST)'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <p className="font-body text-xs text-gray-500">Time Zone: Asia/Kolkata</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-600 mb-3">
                <Mail size={14} />
                <span className="font-display text-xs font-semibold uppercase tracking-wide">Delivery Options</span>
              </div>
              {/* Email */}
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={emailOn} onChange={() => setEmailOn(!emailOn)} className="accent-amber-500" />
                <Mail size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700 w-28">Email</span>
                {emailOn && (
                  <input placeholder="executives@org.com" value={emailAddr}
                    onChange={e => setEmailAddr(e.target.value)}
                    className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-xs font-body text-gray-800 placeholder:text-gray-400
                               focus:outline-none focus:ring-1 focus:ring-amber-400" />
                )}
              </div>
              {/* Save to Location */}
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={saveOn} onChange={() => setSaveOn(!saveOn)} className="accent-amber-500" />
                <FolderOpen size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700 w-28">Save to Location</span>
                {saveOn && (
                  <input value={savePath} onChange={e => setSavePath(e.target.value)}
                    className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-xs font-body text-gray-800 placeholder:text-gray-400
                               focus:outline-none focus:ring-1 focus:ring-amber-400" />
                )}
              </div>
              {/* Download Link */}
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={linkOn} onChange={() => setLinkOn(!linkOn)} className="accent-amber-500" />
                <Link2 size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700 w-28">Download Link</span>
              </div>
            </div>

            <button
              onClick={handleSchedule}
              disabled={submitting || selectedTypes.length === 0}
              className={`w-full bg-gradient-to-r from-pnb-crimson to-pnb-darkred text-white font-display
                               font-bold py-3 rounded-xl hover:from-red-800 hover:to-pnb-crimson
                               transition-all duration-300 shadow-lg flex items-center justify-center gap-2
                               ${(submitting || selectedTypes.length === 0) ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Scheduling...</>
                : <><Calendar size={14} /> Schedule Report →</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── On-Demand Reporting ───────────────────────────────────────────────────────
function OnDemandView({ setActive, showToast }) {
  const [selectedTypes, setSelectedTypes] = useState([])
  const [format, setFormat]               = useState('PDF')
  const [includeCharts, setIncludeCharts] = useState(true)
  const [pwProtect, setPwProtect]         = useState(false)
  const [emailEnabled, setEmailEnabled]   = useState(true)
  const [emailAddr, setEmailAddr]         = useState('')
  const [saveEnabled, setSaveEnabled]     = useState(true)
  const [savePath, setSavePath]           = useState('/Reports/OnDemand/')
  const [linkEnabled, setLinkEnabled]     = useState(false)
  const [slackEnabled, setSlackEnabled]   = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) {
      showToast('error', 'Please select at least one report type')
      return
    }

    setGenerating(true)
    setGeneratedLink(null)
    const fmtKey = format.toLowerCase()

    try {
      // 1. Direct download
      showToast('loading', `Generating ${selectedTypes.length > 1 ? 'consolidated' : ''} report in ${format}...`)
      await downloadReport(selectedTypes, fmtKey)
      showToast('success', `Report downloaded as ${format}!`)

      // 2. Email delivery
      if (emailEnabled && emailAddr.trim()) {
        showToast('loading', `Sending report to ${emailAddr}...`)
        const emailRes = await apiPost('/email', {
          report_types: selectedTypes,
          format: fmtKey,
          include_charts: includeCharts,
          password_protect: pwProtect,
          recipients: emailAddr.split(',').map(e => e.trim()),
        })
        const emailData = await emailRes.json()
        if (emailData.success) {
          showToast('success', `Report sent to ${emailAddr}`)
        }
      }

      // 3. Generate download link
      if (linkEnabled) {
        const linkRes = await apiPost('/link', {
          report_types: selectedTypes,
          format: fmtKey,
          include_charts: includeCharts,
          password_protect: pwProtect,
        })
        const linkData = await linkRes.json()
        if (linkData.success) {
          setGeneratedLink(linkData.download_url)
          showToast('info', 'Download link generated!')
        }
      }

      // 4. Slack (simulated)
      if (slackEnabled) {
        showToast('info', 'Slack notification sent (simulated)')
      }

    } catch (err) {
      showToast('error', `Failed: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActive(null)}
          className="font-display text-xs text-pnb-amber hover:text-pnb-crimson">← Back</button>
        <h1 className="font-display text-xl font-bold text-pnb-crimson">On-Demand Reporting</h1>
      </div>

      <div className="glass-card rounded-2xl p-6 max-w-3xl mx-auto shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-100 rounded-xl"><Search size={20} className="text-pnb-amber" /></div>
          <div>
            <h2 className="font-display text-lg font-bold text-pnb-crimson">On-Demand Reporting</h2>
            <p className="font-body text-xs text-gray-500">Select one or more report types to combine into a single report</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Left — Report type multi-select */}
          <div className="space-y-4">
            <ReportTypeMultiSelect selected={selectedTypes} setSelected={setSelectedTypes} />

            {/* Generated link display */}
            {generatedLink && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <Link2 size={14} className="text-green-600" />
                <span className="font-body text-xs text-green-800 flex-1">Download link ready</span>
                <button
                  onClick={() => {
                    const fullUrl = `${window.location.origin}${generatedLink}`
                    navigator.clipboard.writeText(fullUrl)
                    showToast('success', 'Link copied to clipboard!')
                  }}
                  className="text-xs font-display font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg hover:bg-green-200"
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>

          {/* Right — Delivery options */}
          <div>
            <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
              Delivery Options
            </label>
            <div className="space-y-3">
              {/* Email */}
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${emailEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <input type="checkbox" checked={emailEnabled} onChange={() => setEmailEnabled(!emailEnabled)} className="accent-amber-500" />
                <Mail size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700 flex-1">Send via Email</span>
                <button className={`relative w-10 h-5 rounded-full transition-colors ${emailEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}
                  onClick={() => setEmailEnabled(!emailEnabled)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${emailEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {emailEnabled && (
                <input placeholder="Enter Email Addresses (comma separated)" value={emailAddr}
                  onChange={e => setEmailAddr(e.target.value)}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-body text-gray-800 placeholder:text-gray-400
                             focus:outline-none focus:ring-1 focus:ring-amber-400" />
              )}

              {/* Save location */}
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${saveEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <input type="checkbox" checked={saveEnabled} onChange={() => setSaveEnabled(!saveEnabled)} className="accent-amber-500" />
                <FolderOpen size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700 flex-1">Save to Location</span>
                <button className={`relative w-10 h-5 rounded-full transition-colors ${saveEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}
                  onClick={() => setSaveEnabled(!saveEnabled)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${saveEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {saveEnabled && (
                <div className="flex items-center gap-1">
                  <input value={savePath} onChange={e => setSavePath(e.target.value)}
                    className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-body text-gray-800 placeholder:text-gray-400
                               focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <button className="p-2 border border-amber-200 rounded-xl hover:bg-amber-50">
                    <FolderOpen size={13} className="text-amber-600" />
                  </button>
                </div>
              )}

              {/* Download link */}
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${linkEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <input type="checkbox" checked={linkEnabled} onChange={() => setLinkEnabled(!linkEnabled)} className="accent-amber-500" />
                <Link2 size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700">Download Link</span>
              </div>

              {/* Slack */}
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${slackEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <input type="checkbox" checked={slackEnabled} onChange={() => setSlackEnabled(!slackEnabled)} className="accent-amber-500" />
                <Bell size={13} className="text-gray-500" />
                <span className="font-body text-xs text-gray-700">Slack Notification</span>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-600">⚙</span>
            <span className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide">Advanced Settings</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <label className="font-body text-xs text-gray-600 block mb-1">File Format</label>
              <select value={format} onChange={e => setFormat(e.target.value)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-body text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400">
                {['PDF','JSON','CSV','XLSX','CycloneDX'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="font-body text-xs text-gray-600">Include Charts</label>
              <button onClick={() => setIncludeCharts(!includeCharts)}
                className={`relative w-10 h-5 rounded-full transition-colors ${includeCharts ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeCharts ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="font-body text-xs text-gray-600">Password Protect</label>
              <button onClick={() => setPwProtect(!pwProtect)}
                className={`relative w-10 h-5 rounded-full transition-colors ${pwProtect ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pwProtect ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || selectedTypes.length === 0}
              className={`ml-auto bg-gradient-to-r from-pnb-crimson to-pnb-darkred text-white font-display
                               font-bold text-xs px-6 py-2.5 rounded-xl hover:from-red-800 hover:to-pnb-crimson
                               transition-all duration-300 shadow-lg flex items-center gap-2
                               ${(generating || selectedTypes.length === 0) ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {generating
                ? <><Loader2 size={13} className="animate-spin" /> Generating...</>
                : <><Download size={13} /> Generate Report</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
