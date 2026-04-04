import { useState, useEffect } from 'react'
import dataAPI from '../dataAPI'
import {
  Users, Calendar, Search, Download, Settings,
  Mail, FolderOpen, Link2, Bell, ChevronRight,
  Check, X, Loader2, FileText, AlertCircle,
  BarChart2, Shield, Layers, Star, ClipboardList, ArrowLeft,
  Globe, Cpu, Activity, CheckCircle2
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
  { key: 'Executive Summary Report', icon: BarChart2,    label: 'Executive Summary' },
  { key: 'Asset Discovery Report',   icon: Globe,        label: 'Asset Discovery'   },
  { key: 'Asset Inventory Report',   icon: ClipboardList,label: 'Asset Inventory'   },
  { key: 'CBOM Report',              icon: Layers,       label: 'CBOM'              },
  { key: 'PQC Posture Report',       icon: Shield,       label: 'PQC Posture'       },
  { key: 'Cyber Rating Report',      icon: Star,         label: 'Cyber Rating'      },
]

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null
  const palette = {
    success: { bg: 'bg-green-600',  border: 'border-green-500' },
    error:   { bg: 'bg-red-600',    border: 'border-red-500'   },
    loading: { bg: 'bg-amber-600',  border: 'border-amber-500' },
    info:    { bg: 'bg-blue-600',   border: 'border-blue-500'  },
  }
  const icons = {
    success: <CheckCircle2 size={16} />,
    error:   <AlertCircle  size={16} />,
    loading: <Loader2 size={16} className="animate-spin" />,
    info:    <FileText size={16} />,
  }
  const p = palette[toast.type] || palette.info
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`${p.bg} text-white rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-3 min-w-[320px] border border-white/20`}>
        <div className="shrink-0">{icons[toast.type]}</div>
        <span className="font-body text-sm flex-1 leading-snug">{toast.message}</span>
        {toast.type !== 'loading' && (
          <button onClick={onDismiss} className="hover:bg-white/20 rounded-full p-1 transition-colors shrink-0">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <label className="font-display text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
      {children}
    </label>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onToggle, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none
          ${on ? 'bg-pnb-crimson' : 'bg-slate-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200
          ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      {label && <span className="font-body text-xs text-slate-600">{label}</span>}
    </div>
  )
}

// ── Form input ────────────────────────────────────────────────────────────────
const inputCls = `w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-body
  text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50
  focus:border-amber-400 transition-all`

// ── Back button ───────────────────────────────────────────────────────────────
function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-display font-semibold
        text-slate-500 hover:text-pnb-crimson transition-colors group"
    >
      <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
      Back
    </button>
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
        dash:   dash.success   ? dash   : {},
        cbom:   cbom.success   ? cbom   : {},
        pqc:    pqc.success    ? pqc    : { summary: {} },
        rating: rating.success ? rating : {}
      })
    })
  }, [])

  const toastEl = <Toast toast={toast} onDismiss={() => setToast(null)} />

  if (active === null)       return <><SelectionView setActive={setActive} />{toastEl}</>
  if (active === 'scheduled') return <><ScheduledView setActive={setActive} showToast={showToast} />{toastEl}</>
  if (active === 'ondemand')  return <><OnDemandView  setActive={setActive} showToast={showToast} />{toastEl}</>
  return <><ExecView setActive={setActive} stats={stats} showToast={showToast} />{toastEl}</>
}

// ── Landing selection ─────────────────────────────────────────────────────────
function SelectionView({ setActive }) {
  const cards = [
    {
      icon: Users, label: 'Executive Reporting', key: 'exec',
      desc: 'Board-level risk summaries, Q-VaR models, and KPI dashboards for CISO/CTO.',
      gradient: 'from-blue-600 to-indigo-800',
      glow: 'shadow-blue-500/20',
      accent: 'bg-blue-400/20 group-hover:bg-blue-300/30',
    },
    {
      icon: Calendar, label: 'Scheduled Reporting', key: 'scheduled',
      desc: 'Automate periodic report generation with email and storage delivery.',
      gradient: 'from-pnb-crimson to-red-900',
      glow: 'shadow-red-500/20',
      accent: 'bg-red-400/20 group-hover:bg-red-300/30',
    },
    {
      icon: Activity, label: 'On-Demand Reporting', key: 'ondemand',
      desc: 'Generate targeted reports instantly for specific assets, incidents, or audits.',
      gradient: 'from-amber-500 to-orange-700',
      glow: 'shadow-amber-500/20',
      accent: 'bg-amber-400/20 group-hover:bg-amber-300/30',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Reporting</h1>
        <p className="font-body text-sm text-slate-500 mt-0.5">Generate, schedule and export security reports across the platform.</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {cards.map(({ icon: Icon, label, key, desc, gradient, glow, accent }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`group relative overflow-hidden rounded-2xl text-left
              shadow-xl ${glow} hover:shadow-2xl transition-all duration-300
              hover:-translate-y-1.5 cursor-pointer`}
          >
            {/* Background gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
            {/* Decorative ring */}
            <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full border border-white/10" />
            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full border border-white/10" />

            <div className="relative z-10 p-7">
              {/* Icon badge */}
              <div className={`w-12 h-12 ${accent} rounded-xl flex items-center justify-center mb-5 transition-colors`}>
                <Icon size={24} className="text-white" />
              </div>
              <p className="font-display text-lg font-bold text-white mb-2 leading-tight">{label}</p>
              <p className="font-body text-sm text-white/75 leading-relaxed">{desc}</p>

              {/* CTA arrow */}
              <div className="mt-5 flex items-center gap-1.5 text-white/80 text-xs font-display font-semibold
                group-hover:text-white transition-colors">
                Get started
                <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Executive Reporting ───────────────────────────────────────────────────────
function ExecView({ setActive, stats, showToast }) {
  const [downloading, setDownloading] = useState(null)

  if (!stats) return (
    <div className="p-8 flex items-center justify-center gap-3 text-pnb-crimson font-display font-semibold">
      <Loader2 size={18} className="animate-spin" />
      Aggregating executive metrics...
    </div>
  )

  const tiles = [
    {
      title: 'Asset Discovery', icon: Globe, iconColor: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
      items: [
        { label: 'Total Subdomains & IPs',  value: stats.dash.statCards?.[0]?.value || 0 },
        { label: 'Public Web Applications', value: stats.dash.statCards?.[1]?.value || 0 },
      ],
    },
    {
      title: 'Cyber Rating', icon: Star, iconColor: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100',
      items: [
        { label: 'Consolidated Score', value: stats.rating.enterpriseScore || 0 },
        { label: 'Current Tier',       value: stats.rating.enterpriseTier  || 'Unknown' },
      ],
    },
    {
      title: 'Asset Inventory', icon: ClipboardList, iconColor: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100',
      items: [
        { label: 'Active Certificates', value: stats.cbom.stats?.activeCerts || 0 },
        { label: 'Weak Crypto Found',   value: stats.cbom.stats?.weakCrypto  || 0 },
      ],
    },
    {
      title: 'PQC Posture', icon: Shield, iconColor: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100',
      items: [
        { label: 'Elite-PQC Ready', value: stats.pqc.summary?.pqcReadyCount || 0 },
        { label: 'Standard',        value: stats.pqc.summary?.stdCount      || 0 },
        { label: 'Legacy',          value: stats.pqc.summary?.legacyCount   || 0 },
      ],
    },
    {
      title: 'CBOM', icon: Layers, iconColor: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100',
      items: [
        { label: 'Assets Analyzed',      value: stats.cbom.stats?.totalApps  || 0 },
        { label: 'Certificate Issues',   value: stats.cbom.stats?.certIssues || 0 },
      ],
    },
  ]

  const downloadButtons = [
    { label: 'Executive Summary',  sub: 'PDF',       icon: BarChart2,    reportType: 'Executive Summary Report', format: 'pdf'       },
    { label: 'Risk Assessment',    sub: 'JSON',      icon: Shield,       reportType: 'PQC Posture Report',       format: 'json'      },
    { label: 'Asset Inventory',    sub: 'CSV',       icon: ClipboardList,reportType: 'Asset Inventory Report',   format: 'csv'       },
    { label: 'CBOM Report',        sub: 'CycloneDX', icon: Layers,       reportType: 'CBOM Report',              format: 'cyclonedx' },
  ]

  const handleDownload = async (btn) => {
    const key = btn.label
    setDownloading(key)
    showToast('loading', `Generating ${btn.label} (${btn.sub})...`)
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
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackBtn onClick={() => setActive(null)} />
        <div className="w-px h-4 bg-slate-200" />
        <h1 className="font-display text-xl font-bold text-pnb-crimson">Executive Reporting</h1>
      </div>

      {/* Metrics tiles */}
      <div className="grid grid-cols-5 gap-3">
        {tiles.map(({ title, icon: Icon, iconColor, bg, border, items }) => (
          <div key={title} className={`glass-card rounded-xl p-4 border ${border} ${bg}/40 flex flex-col gap-3`}>
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${bg} border ${border}`}>
                <Icon size={13} className={iconColor} />
              </div>
              <h3 className="font-display text-xs font-semibold text-slate-700">{title}</h3>
            </div>
            {items.map(({ label, value }) => (
              <div key={label} className="flex flex-col">
                <span className="font-mono text-lg font-extrabold text-slate-800">{value}</span>
                <span className="font-body text-[10px] text-slate-500 leading-tight">{label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Download section */}
      <div className="glass-card rounded-xl p-5 border border-amber-100/50 shadow-sm shadow-amber-900/5">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-pnb-crimson mb-4">
          Download Reports
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {downloadButtons.map(btn => {
            const BtnIcon = btn.icon
            const isLoading = downloading === btn.label
            return (
              <button
                key={btn.label}
                onClick={() => handleDownload(btn)}
                disabled={!!downloading}
                className={`group flex flex-col items-start gap-2 p-4 rounded-xl border transition-all duration-200
                  ${isLoading
                    ? 'border-pnb-crimson bg-pnb-crimson/5 cursor-wait'
                    : 'border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50/60 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'}
                  ${downloading && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`p-2 rounded-lg transition-colors ${isLoading ? 'bg-pnb-crimson/10' : 'bg-amber-50 group-hover:bg-amber-100'}`}>
                  {isLoading
                    ? <Loader2 size={16} className="text-pnb-crimson animate-spin" />
                    : <BtnIcon size={16} className="text-pnb-amber" />
                  }
                </div>
                <div className="text-left">
                  <p className="font-display text-xs font-bold text-slate-700">{btn.label}</p>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5">{btn.sub}</p>
                </div>
                <Download size={11} className={`mt-auto self-end transition-colors ${isLoading ? 'text-pnb-crimson' : 'text-slate-300 group-hover:text-pnb-amber'}`} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Multi-select report type chips ────────────────────────────────────────────
function ReportTypeMultiSelect({ selected, setSelected }) {
  return (
    <div>
      <FieldLabel>Report Types <span className="normal-case font-normal text-slate-400">(select one or more)</span></FieldLabel>
      <div className="flex flex-wrap gap-2">
        {ALL_REPORT_TYPES.map(({ key, icon: Icon, label }) => {
          const isSelected = selected.includes(key)
          return (
            <button
              key={key}
              onClick={() => setSelected(prev =>
                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
              )}
              className={`flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200
                ${isSelected
                  ? 'bg-pnb-crimson text-white border-pnb-crimson shadow-sm'
                  : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'
                }`}
            >
              {isSelected
                ? <Check size={11} />
                : <Icon size={11} className="text-slate-400" />
              }
              {label}
            </button>
          )
        })}
      </div>
      {selected.length > 1 && (
        <p className="font-body text-xs text-amber-700 mt-2 flex items-center gap-1.5">
          <FileText size={11} />
          {selected.length} types selected — merged into one consolidated report
        </p>
      )}
    </div>
  )
}

// ── Pill button (frequency / format / sections selectors) ─────────────────────
function PillSelect({ options, value, onChange, multi = false, selected, onToggle }) {
  if (multi) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const active = selected?.includes(o)
          return (
            <button key={o} onClick={() => onToggle(o)}
              className={`px-3.5 py-1.5 text-xs font-display font-semibold rounded-full border transition-all duration-150
                ${active ? 'bg-pnb-crimson text-white border-pnb-crimson shadow-sm' : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'}`}>
              {active && <Check size={10} className="inline mr-1" />}{o}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-3.5 py-1.5 text-xs font-display font-semibold rounded-full border transition-all duration-150
            ${value === o ? 'bg-pnb-crimson text-white border-pnb-crimson shadow-sm' : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'}`}>
          {o}
        </button>
      ))}
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, color = 'text-pnb-crimson' }) {
  return (
    <div className={`flex items-center gap-2 ${color} mb-3`}>
      <Icon size={14} />
      <span className="font-display text-xs font-bold uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-current opacity-10" />
    </div>
  )
}

// ── Delivery row ─────────────────────────────────────────────────────────────
function DeliveryRow({ icon: Icon, label, on, onToggle, children }) {
  return (
    <div className={`rounded-xl border transition-all overflow-hidden
      ${on ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3 px-3.5 py-2.5" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div className={`p-1.5 rounded-lg transition-colors ${on ? 'bg-amber-100' : 'bg-slate-100'}`}>
          <Icon size={13} className={on ? 'text-amber-600' : 'text-slate-400'} />
        </div>
        <span className={`font-display text-xs font-semibold flex-1 ${on ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
        <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0
          ${on ? 'bg-pnb-crimson' : 'bg-slate-200'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200
            ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </div>
      {on && children && <div className="px-3.5 pb-3">{children}</div>}
    </div>
  )
}

// ── Scheduled Reporting ───────────────────────────────────────────────────────
function ScheduledView({ setActive, showToast }) {
  const [enabled, setEnabled]     = useState(true)
  const [freq, setFreq]           = useState('Weekly')
  const [assets, setAssets]       = useState('All Assets')
  const [selectedTypes, setSelectedTypes] = useState(['Executive Summary Report'])
  const [scheduleDate, setScheduleDate]   = useState('2026-04-25')
  const [scheduleTime, setScheduleTime]   = useState('09:00 AM (IST)')
  const [submitting, setSubmitting]       = useState(false)
  const [format, setFormat]               = useState('PDF')

  const sections = ['Discovery', 'Inventory', 'CBOM', 'PQC Posture', 'Cyber Rating']
  const [checkedSections, setCheckedSections] = useState(new Set(sections))
  const toggleSection = s => setCheckedSections(prev => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
  })

  const [emailOn, setEmailOn]     = useState(false)
  const [emailAddr, setEmailAddr] = useState('')
  const [saveOn, setSaveOn]       = useState(true)
  const [savePath, setSavePath]   = useState('/Reports/Quarterly/')
  const [linkOn, setLinkOn]       = useState(false)

  const handleSchedule = async () => {
    if (selectedTypes.length === 0) { showToast('error', 'Please select at least one report type'); return }
    setSubmitting(true)
    showToast('loading', 'Saving report schedule...')
    try {
      const res = await apiPost('/schedule', {
        report_types: selectedTypes, format: format.toLowerCase(), frequency: freq,
        schedule_date: scheduleDate, schedule_time: scheduleTime, assets_scope: assets,
        sections: Array.from(checkedSections), include_charts: true, password_protect: false,
        delivery_email: emailOn ? emailAddr : null,
        delivery_save_path: saveOn ? savePath : null,
        delivery_link: linkOn, enabled,
      })
      const data = await res.json()
      if (data.success) showToast('success', `Schedule saved · ${freq} · ${selectedTypes.length > 1 ? 'consolidated' : selectedTypes[0]}`)
      else showToast('error', data.detail || 'Failed to save schedule')
    } catch (err) {
      showToast('error', `Error: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <BackBtn onClick={() => setActive(null)} />
        <div className="w-px h-4 bg-slate-200" />
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson leading-tight">Scheduled Reporting</h1>
          <p className="font-body text-xs text-slate-500 mt-0.5">Automate periodic report delivery to email or storage.</p>
        </div>
        <div className="ml-auto flex items-center gap-2.5 bg-white border border-amber-200 rounded-xl px-4 py-2">
          <span className="font-display text-xs font-semibold text-slate-600">Schedule Active</span>
          <Toggle on={enabled} onToggle={() => setEnabled(!enabled)} />
        </div>
      </div>

      {/* ── Main layout: form + summary sidebar ── */}
      <div className="grid grid-cols-3 gap-5">
        {/* ── 2/3 form area ── */}
        <div className="col-span-2 space-y-5">

          {/* Card 1: Report content */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={FileText} label="Report Content" />
            <div className="space-y-4">
              <div>
                <FieldLabel>Report Types</FieldLabel>
                <ReportTypeMultiSelect selected={selectedTypes} setSelected={setSelectedTypes} />
              </div>
              <div>
                <FieldLabel>Include Sections</FieldLabel>
                <PillSelect
                  multi options={sections}
                  selected={Array.from(checkedSections)}
                  onToggle={toggleSection}
                />
              </div>
              <div>
                <FieldLabel>Asset Scope</FieldLabel>
                <PillSelect
                  options={['All Assets','Web Applications','APIs','Servers','Gateways']}
                  value={assets} onChange={setAssets}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Schedule timing */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Calendar} label="Schedule Timing" color="text-amber-600" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Frequency</FieldLabel>
                <PillSelect
                  options={['Daily','Weekly','Bi-Weekly','Monthly','Quarterly']}
                  value={freq} onChange={setFreq}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Start Date</FieldLabel>
                  <input type="date" value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <FieldLabel>Time (IST)</FieldLabel>
                  <select value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className={inputCls}>
                    {['09:00 AM (IST)','12:00 PM (IST)','06:00 PM (IST)'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Output format */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Download} label="Output Format" color="text-indigo-600" />
            <PillSelect options={['PDF','JSON','CSV','XLSX','CycloneDX']} value={format} onChange={setFormat} />
          </div>

          {/* Card 4: Delivery */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Mail} label="Delivery" color="text-blue-600" />
            <div className="space-y-2">
              <DeliveryRow icon={Mail} label="Send via Email" on={emailOn} onToggle={() => setEmailOn(!emailOn)}>
                <input placeholder="executives@org.com, ciso@org.com" value={emailAddr}
                  onChange={e => setEmailAddr(e.target.value)} className={`${inputCls} text-xs py-1.5`} />
              </DeliveryRow>
              <DeliveryRow icon={FolderOpen} label="Save to Location" on={saveOn} onToggle={() => setSaveOn(!saveOn)}>
                <input value={savePath} onChange={e => setSavePath(e.target.value)}
                  className={`${inputCls} text-xs py-1.5`} />
              </DeliveryRow>
              <DeliveryRow icon={Link2} label="Generate Download Link" on={linkOn} onToggle={() => setLinkOn(!linkOn)} />
            </div>
          </div>
        </div>

        {/* ── 1/3 Summary sidebar ── */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm sticky top-4">
            <SectionHeader icon={CheckCircle2} label="Schedule Summary" color="text-green-600" />

            <div className="space-y-3">
              {/* Status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-display font-bold
                ${enabled ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                {enabled ? 'Schedule Enabled' : 'Schedule Disabled'}
              </div>

              {/* Summary items */}
              {[
                { label: 'Frequency',   value: freq },
                { label: 'Format',      value: format },
                { label: 'Asset Scope', value: assets },
                { label: 'Start Date',  value: scheduleDate },
                { label: 'Time',        value: scheduleTime },
                { label: 'Sections',    value: `${checkedSections.size} of ${sections.length}` },
                { label: 'Reports',     value: selectedTypes.length === 0 ? 'None selected' : selectedTypes.length === 1 ? selectedTypes[0].replace(' Report','') : `${selectedTypes.length} types` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2 text-xs">
                  <span className="font-body text-slate-400 shrink-0">{label}</span>
                  <span className="font-display font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}

              {/* Delivery chips */}
              <div>
                <span className="font-body text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">Delivery</span>
                <div className="flex flex-wrap gap-1.5">
                  {emailOn && <span className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-display font-semibold px-2 py-0.5 rounded-full">Email</span>}
                  {saveOn  && <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-display font-semibold px-2 py-0.5 rounded-full">File Save</span>}
                  {linkOn  && <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-display font-semibold px-2 py-0.5 rounded-full">Link</span>}
                  {!emailOn && !saveOn && !linkOn && <span className="text-slate-400 text-xs">None selected</span>}
                </div>
              </div>
            </div>

            <button
              onClick={handleSchedule}
              disabled={submitting || selectedTypes.length === 0}
              className={`mt-5 w-full bg-gradient-to-r from-pnb-crimson to-red-800 text-white font-display
                font-bold py-3 rounded-xl text-sm transition-all duration-300 shadow-lg flex items-center justify-center gap-2
                hover:from-red-700 hover:to-pnb-crimson hover:shadow-xl hover:-translate-y-0.5
                ${(submitting || selectedTypes.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><Calendar size={14} /> Save Schedule</>
              }
            </button>

            {selectedTypes.length === 0 && (
              <p className="font-body text-xs text-red-500 text-center mt-2">Select at least one report type</p>
            )}
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
  const [emailEnabled, setEmailEnabled]   = useState(false)
  const [emailAddr, setEmailAddr]         = useState('')
  const [saveEnabled, setSaveEnabled]     = useState(false)
  const [savePath, setSavePath]           = useState('/Reports/OnDemand/')
  const [linkEnabled, setLinkEnabled]     = useState(false)
  const [slackEnabled, setSlackEnabled]   = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) { showToast('error', 'Please select at least one report type'); return }
    setGenerating(true)
    setGeneratedLink(null)
    const fmtKey = format.toLowerCase()
    try {
      showToast('loading', `Generating ${selectedTypes.length > 1 ? 'consolidated ' : ''}${format} report...`)
      await downloadReport(selectedTypes, fmtKey)
      showToast('success', `Report downloaded as ${format}!`)

      if (emailEnabled && emailAddr.trim()) {
        showToast('loading', `Sending to ${emailAddr}...`)
        const r = await apiPost('/email', { report_types: selectedTypes, format: fmtKey, include_charts: includeCharts, password_protect: pwProtect, recipients: emailAddr.split(',').map(e => e.trim()) })
        const d = await r.json()
        if (d.success) showToast('success', `Report sent to ${emailAddr}`)
      }
      if (linkEnabled) {
        const r = await apiPost('/link', { report_types: selectedTypes, format: fmtKey, include_charts: includeCharts, password_protect: pwProtect })
        const d = await r.json()
        if (d.success) { setGeneratedLink(d.download_url); showToast('info', 'Download link generated!') }
      }
      if (slackEnabled) showToast('info', 'Slack notification sent (simulated)')
    } catch (err) {
      showToast('error', `Failed: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = selectedTypes.length > 0 && !generating

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <BackBtn onClick={() => setActive(null)} />
        <div className="w-px h-4 bg-slate-200" />
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson leading-tight">On-Demand Reporting</h1>
          <p className="font-body text-xs text-slate-500 mt-0.5">Configure, generate, and deliver any report instantly.</p>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div className="grid grid-cols-3 gap-5">

        {/* ── Col 1+2: form ── */}
        <div className="col-span-2 space-y-4">

          {/* Report content */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={FileText} label="Report Content" />
            <div className="space-y-4">
              <div>
                <FieldLabel>Report Types <span className="normal-case font-normal text-slate-400">(select one or more)</span></FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_REPORT_TYPES.map(({ key, icon: Icon, label }) => {
                    const isSel = selectedTypes.includes(key)
                    return (
                      <button key={key}
                        onClick={() => setSelectedTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all duration-150
                          ${isSel ? 'bg-pnb-crimson/5 border-pnb-crimson shadow-sm' : 'bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/60'}`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 transition-colors ${isSel ? 'bg-pnb-crimson' : 'bg-slate-100'}`}>
                          <Icon size={12} className={isSel ? 'text-white' : 'text-slate-400'} />
                        </div>
                        <span className={`font-display text-xs font-semibold ${isSel ? 'text-pnb-crimson' : 'text-slate-600'}`}>{label}</span>
                        {isSel && <Check size={12} className="ml-auto text-pnb-crimson shrink-0" />}
                      </button>
                    )
                  })}
                </div>
                {selectedTypes.length > 1 && (
                  <p className="font-body text-xs text-amber-700 mt-2 flex items-center gap-1.5">
                    <FileText size={11} />
                    {selectedTypes.length} types selected — merged into one consolidated report
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Output format */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Download} label="Output Format" color="text-indigo-600" />
            <PillSelect options={['PDF','JSON','CSV','XLSX','CycloneDX']} value={format} onChange={setFormat} />
          </div>

          {/* Delivery */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Mail} label="Delivery" color="text-blue-600" />
            <div className="space-y-2">
              <DeliveryRow icon={Mail} label="Send via Email" on={emailEnabled} onToggle={() => setEmailEnabled(!emailEnabled)}>
                <input placeholder="executives@org.com, ciso@org.com" value={emailAddr}
                  onChange={e => setEmailAddr(e.target.value)} className={`${inputCls} text-xs py-1.5`} />
              </DeliveryRow>
              <DeliveryRow icon={FolderOpen} label="Save to Location" on={saveEnabled} onToggle={() => setSaveEnabled(!saveEnabled)}>
                <div className="flex gap-1.5">
                  <input value={savePath} onChange={e => setSavePath(e.target.value)} className={`${inputCls} text-xs py-1.5`} />
                  <button className="p-2 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors shrink-0">
                    <FolderOpen size={13} className="text-amber-600" />
                  </button>
                </div>
              </DeliveryRow>
              <DeliveryRow icon={Link2} label="Generate Shareable Link" on={linkEnabled} onToggle={() => setLinkEnabled(!linkEnabled)} />
              <DeliveryRow icon={Bell} label="Slack Notification" on={slackEnabled} onToggle={() => setSlackEnabled(!slackEnabled)} />
            </div>
          </div>

          {/* Advanced */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={Settings} label="Advanced Settings" color="text-slate-500" />
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-slate-600">Include Charts</span>
                <Toggle on={includeCharts} onToggle={() => setIncludeCharts(!includeCharts)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-slate-600">Password Protect</span>
                <Toggle on={pwProtect} onToggle={() => setPwProtect(!pwProtect)} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Col 3: preview + generate ── */}
        <div className="space-y-4 sticky top-4 self-start">
          {/* Preview card */}
          <div className="glass-card rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <SectionHeader icon={FileText} label="Report Preview" color="text-slate-500" />

            {selectedTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                  <FileText size={18} className="text-slate-300" />
                </div>
                <p className="font-body text-xs text-slate-400">Select report types to preview</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedTypes.map(key => {
                  const meta = ALL_REPORT_TYPES.find(r => r.key === key)
                  if (!meta) return null
                  const Icon = meta.icon
                  return (
                    <div key={key} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <div className="p-1.5 bg-pnb-crimson/10 rounded-lg">
                        <Icon size={12} className="text-pnb-crimson" />
                      </div>
                      <span className="font-display text-xs font-semibold text-slate-700 flex-1">{meta.label}</span>
                      <span className="font-mono text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{format}</span>
                    </div>
                  )
                })}

                {selectedTypes.length > 1 && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <Layers size={11} />
                    Will be merged into 1 consolidated report
                  </div>
                )}
              </div>
            )}

            {/* Generated link */}
            {generatedLink && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <Link2 size={13} className="text-green-600 shrink-0" />
                <span className="font-body text-xs text-green-800 flex-1">Link ready</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${generatedLink}`); showToast('success', 'Link copied!') }}
                  className="text-xs font-display font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full bg-gradient-to-r from-pnb-crimson to-red-800 text-white font-display
              font-bold py-3.5 rounded-2xl text-sm transition-all duration-300 shadow-lg flex items-center justify-center gap-2
              hover:from-red-700 hover:to-pnb-crimson hover:shadow-xl hover:-translate-y-0.5
              ${!canGenerate ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
              : <><Download size={14} /> Generate Report</>
            }
          </button>
          {selectedTypes.length === 0 && (
            <p className="font-body text-xs text-slate-400 text-center">Select at least one report type above</p>
          )}
        </div>
      </div>
    </div>
  )
}
