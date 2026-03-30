import { useState, useEffect, useRef } from 'react'
import { Radar, Plus, X, Play, Download, CheckCircle, AlertCircle, XCircle, FolderOpen, Globe, Shield } from 'lucide-react'

const SCAN_PHASES = [
  { label: 'Resolving DNS',                pct: 15,  color: '#3b82f6' },
  { label: 'Enumerating Assets',           pct: 35,  color: '#7c3aed' },
  { label: 'TLS Handshake Probes',         pct: 70,  color: '#d97706' },
  { label: 'Cert / Web Fingerprint',       pct: 88,  color: '#f59e0b' },
  { label: 'Writing Outputs',              pct: 100, color: '#16a34a' },
]

function tlsColor(v) {
  if (!v) return 'text-gray-400'
  if (v === 'TLSv1.3') return 'text-green-600'
  if (v === 'TLSv1.2') return 'text-blue-600'
  if (v === 'TLSv1.1') return 'text-orange-500'
  return 'text-red-600'
}

function keyColor(bits) {
  if (!bits) return 'text-gray-400'
  if (bits >= 4096) return 'text-green-600'
  if (bits >= 2048) return 'text-blue-600'
  if (bits >= 1024) return 'text-orange-500'
  return 'text-red-600'
}

function parsePorts(str) {
  return str
    .split(/[\s,]+/)
    .map(p => parseInt(p, 10))
    .filter(p => !isNaN(p) && p > 0 && p <= 65535)
}

function SeverityBadge({ severity }) {
  const cls = severity === 'high'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700'
  return (
    <span className={`font-display text-xs font-bold px-2 py-0.5 rounded capitalize ${cls}`}>
      {severity}
    </span>
  )
}

function TechBadge({ label }) {
  return (
    <span className="bg-indigo-100 text-indigo-700 font-mono text-xs px-1.5 py-0.5 rounded mr-1 mb-0.5 inline-block">
      {label}
    </span>
  )
}

export default function ScannerEngine() {
  const [targets,     setTargets]     = useState(['pnb.bank.in'])
  const [newTarget,   setNewTarget]   = useState('')
  const [ports,       setPorts]       = useState('443, 8443')
  const [doEnum,      setDoEnum]      = useState(false)
  const [tlsTimeout,  setTlsTimeout]  = useState(6)
  const [resolveTO,   setResolveTO]   = useState(5)
  const [outputDir,   setOutputDir]   = useState('./public/data/PNB')
  const [writeFiles,  setWriteFiles]  = useState(true)
  const [scanning,    setScanning]    = useState(false)
  const [phase,       setPhase]       = useState(-1)
  const [progress,    setProgress]    = useState(0)
  const [logs,        setLogs]        = useState([])

  // Structured scan results from `done` event
  const [cbomRecords,    setCbomRecords]    = useState(null)   // valid crypto records only
  const [shadowRecords,  setShadowRecords]  = useState([])
  const [subdomains,     setSubdomains]     = useState([])
  const [outputPaths,    setOutputPaths]    = useState(null)   // {cbom_path, shadow_crypto_path, subdomains_path}
  const [scanMeta,       setScanMeta]       = useState(null)   // {total_scanned, ok, errors, scanned_at}

  // All streamed result events (for CBOM + HTTP fingerprint tabs)
  const [streamedResults, setStreamedResults] = useState([])

  const [selectedRow,  setSelectedRow]  = useState(null)
  const [activeTab,    setActiveTab]    = useState('cbom')
  const [apiError,     setApiError]     = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  function addTarget() {
    const t = newTarget.trim().toLowerCase()
    if (t && !targets.includes(t)) setTargets(prev => [...prev, t])
    setNewTarget('')
  }

  function removeTarget(t) { setTargets(prev => prev.filter(x => x !== t)) }

  function appendLog(level, message) {
    const tag = `[${level.toUpperCase()}]`.padEnd(8)
    setLogs(prev => [...prev, `${tag} ${message}`])
  }

  const hasResults = cbomRecords !== null

  async function runScan() {
    if (scanning || targets.length === 0) return

    setScanning(true)
    setCbomRecords(null)
    setShadowRecords([])
    setSubdomains([])
    setStreamedResults([])
    setOutputPaths(null)
    setScanMeta(null)
    setSelectedRow(null)
    setLogs([])
    setProgress(0)
    setPhase(0)
    setApiError(null)

    const portList = parsePorts(ports)
    const body = JSON.stringify({
      targets,
      ports:                portList.length ? portList : [443],
      tls_timeout:          tlsTimeout,
      resolve_timeout:      resolveTO,
      enumerate_subdomains: doEnum,
      output_dir:           outputDir || '.',
      write_files:          writeFiles,
    })

    let response
    try {
      response = await fetch('/api/scan/stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch (err) {
      setApiError(`Cannot reach backend: ${err.message}. Make sure scanner_api.py is running on port 8000.`)
      setScanning(false)
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      setApiError(`Backend error ${response.status}: ${text}`)
      setScanning(false)
      return
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const messages = buffer.split('\n\n')
        buffer = messages.pop()

        for (const msg of messages) {
          if (!msg.trim()) continue
          let eventType = 'message'
          let dataStr   = ''

          for (const line of msg.split('\n')) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim()
            if (line.startsWith('data:'))  dataStr   = line.slice(5).trim()
          }

          if (!dataStr) continue
          let payload
          try { payload = JSON.parse(dataStr) } catch { continue }

          if (eventType === 'log') {
            appendLog(payload.level, payload.message)
          } else if (eventType === 'progress') {
            setPhase(payload.phase)
            setProgress(payload.pct)
          } else if (eventType === 'result') {
            setStreamedResults(prev => [...prev, payload])
          } else if (eventType === 'done') {
            // New v3 done payload
            setCbomRecords(payload.cbom || [])
            setShadowRecords(payload.shadow_crypto || [])
            setSubdomains(payload.subdomains || [])
            setOutputPaths({
              cbom_path:           payload.cbom_path,
              shadow_crypto_path:  payload.shadow_crypto_path,
              subdomains_path:     payload.subdomains_path,
              enriched_cbom_path:  payload.enriched_cbom_path,
            })
            setScanMeta({
              total_scanned:      payload.total_scanned,
              ok:                 payload.ok,
              errors:             payload.errors,
              scanned_at:         payload.scanned_at,
              diff:               payload.diff || null,
              enrichment_summary: payload.enrichment_summary || null,
            })
            setProgress(100)
            setPhase(-1)
          } else if (eventType === 'error') {
            setApiError(payload.message)
          }
        }
      }
    } catch (err) {
      if (!apiError) setApiError(`Stream error: ${err.message}`)
    } finally {
      setScanning(false)
    }
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Use streamed results for per-record HTTP fingerprint data (richer than done.cbom)
  // Fall back to cbomRecords for summary display
  const displayRecords = streamedResults.length > 0 ? streamedResults : (cbomRecords || [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson flex items-center gap-2">
            <Radar size={20} className="text-amber-500" /> QRIE Scanner Engine
          </h1>
          <p className="font-body text-sm text-gray-600 mt-0.5">
            TLS probing · HTTP fingerprinting · OS detection · Shadow crypto · CBOM generation
          </p>
        </div>
        {hasResults && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadJSON(cbomRecords, 'cbom.json')}
              className="flex items-center gap-1.5 bg-green-600 text-white font-display text-xs font-bold
                         px-3 py-2 rounded-lg hover:bg-green-700 transition-colors">
              <Download size={13} /> CBOM
            </button>
            <button
              onClick={() => downloadJSON(shadowRecords, 'shadow_crypto.json')}
              className="flex items-center gap-1.5 bg-red-700 text-white font-display text-xs font-bold
                         px-3 py-2 rounded-lg hover:bg-red-800 transition-colors">
              <Download size={13} /> Shadow Crypto
            </button>
          </div>
        )}
      </div>

      {/* API error banner */}
      {apiError && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex items-start gap-3">
          <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-display text-xs font-bold text-red-700">Scanner Backend Error</p>
            <p className="font-body text-xs text-red-600 mt-0.5">{apiError}</p>
          </div>
          <button onClick={() => setApiError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Output paths banner */}
      {outputPaths && writeFiles && (outputPaths.cbom_path || outputPaths.shadow_crypto_path) && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <FolderOpen size={15} className="text-green-600 flex-shrink-0" />
          <div className="flex items-center gap-4 flex-wrap font-mono text-xs text-green-800">
            {outputPaths.subdomains_path    && <span>subdomains → <strong>{outputPaths.subdomains_path}</strong></span>}
            {outputPaths.cbom_path          && <span>cbom → <strong>{outputPaths.cbom_path}</strong></span>}
            {outputPaths.shadow_crypto_path && <span>shadow_crypto → <strong>{outputPaths.shadow_crypto_path}</strong></span>}
            {outputPaths.enriched_cbom_path && <span>enriched_cbom → <strong>{outputPaths.enriched_cbom_path}</strong></span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">

        {/* ── CONFIG PANEL ──────────────────────────────────────── */}
        <div className="col-span-4 space-y-3">
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
              Scan Configuration
            </h3>

            {/* Target list */}
            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
                Targets
              </label>
              <div className="space-y-1.5 mb-2">
                {targets.map(t => (
                  <div key={t} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    <span className="font-mono text-xs text-gray-700 flex-1">{t}</span>
                    <button onClick={() => removeTarget(t)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTarget()}
                  placeholder="domain.com or IP"
                  className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-xs font-mono
                             focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <button onClick={addTarget}
                  className="bg-pnb-crimson text-white px-3 py-1.5 rounded-lg hover:bg-red-800 transition-colors">
                  <Plus size={13} />
                </button>
              </div>
            </div>

            {/* Ports */}
            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                Ports
              </label>
              <input value={ports} onChange={e => setPorts(e.target.value)}
                className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-xs font-mono
                           focus:outline-none focus:ring-1 focus:ring-amber-400" />
              <p className="font-body text-xs text-gray-400 mt-1">Comma-separated. Default: 443, 8443</p>
            </div>

            {/* Timeouts */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'TLS Timeout (s)',     val: tlsTimeout, set: setTlsTimeout },
                { label: 'Resolve Timeout (s)', val: resolveTO,  set: setResolveTO  },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="font-display text-xs font-semibold text-gray-600 block mb-1">{label}</label>
                  <input type="number" value={val} onChange={e => set(+e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-xs font-mono
                               focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </div>
              ))}
            </div>

            {/* Output directory */}
            <div>
              <label className="font-display text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                Output Directory
              </label>
              <div className="flex gap-2 items-center">
                <FolderOpen size={13} className="text-amber-500 flex-shrink-0" />
                <input value={outputDir} onChange={e => setOutputDir(e.target.value)}
                  placeholder="./output"
                  className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-xs font-mono
                             focus:outline-none focus:ring-1 focus:ring-amber-400" />
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              {[
                { label: '--enumerate-subdomains', desc: 'crt.sh subdomain discovery', val: doEnum,     set: setDoEnum     },
                { label: '--write-files',          desc: 'Save JSON outputs to disk',  val: writeFiles, set: setWriteFiles },
              ].map(({ label, desc, val, set }) => (
                <div key={label} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div>
                    <p className="font-display text-xs font-semibold text-gray-700">{label}</p>
                    <p className="font-body text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <button onClick={() => set(!val)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${val ? 'bg-amber-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                      ${val ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* CLI preview */}
            <div className="bg-slate-900 rounded-xl p-3 font-mono text-xs">
              <p className="text-amber-400 mb-1"># API request preview:</p>
              <p className="text-green-400">POST /api/scan/stream</p>
              <pre className="text-slate-300 text-xs whitespace-pre-wrap mt-1">{JSON.stringify({
                targets,
                ports: parsePorts(ports).length ? parsePorts(ports) : [443],
                tls_timeout: tlsTimeout,
                resolve_timeout: resolveTO,
                enumerate_subdomains: doEnum,
                output_dir: outputDir || '.',
                write_files: writeFiles,
              }, null, 2)}</pre>
            </div>

            {/* Scan button */}
            <button
              onClick={runScan}
              disabled={scanning || targets.length === 0}
              className={`w-full py-3 font-display font-extrabold text-sm rounded-xl transition-all duration-300 shadow-lg
                flex items-center justify-center gap-2
                ${scanning
                  ? 'bg-amber-400 text-white cursor-wait'
                  : targets.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pnb-crimson to-red-800 text-white hover:from-red-800 hover:to-pnb-crimson'
                }`}
            >
              {scanning
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scanning...</>
                : <><Play size={15} /> Run Scan</>
              }
            </button>
          </div>

          {/* Scan phase tracker */}
          {(scanning || hasResults) && (
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
                  Scan Progress
                </h3>
                <span className="font-display text-sm font-extrabold text-pnb-crimson">{Math.round(progress)}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    background: progress < 100
                      ? 'linear-gradient(90deg, #8B0000, #F59E0B)'
                      : '#16a34a'
                  }} />
              </div>
              {SCAN_PHASES.map((p, i) => {
                const done    = progress >= p.pct
                const current = phase === i && scanning
                return (
                  <div key={p.label} className={`flex items-center gap-2.5 mb-2 transition-all
                    ${done ? 'opacity-100' : 'opacity-35'}`}>
                    <div className={`relative w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                      ${done ? 'bg-green-500' : current ? 'bg-amber-500' : 'bg-gray-200'}`}>
                      {current && (
                        <div className="absolute inset-0 rounded-full bg-amber-400 scanner-ping" />
                      )}
                      {done
                        ? <CheckCircle size={12} className="text-white" />
                        : <span className="text-white font-display text-xs font-bold">{i+1}</span>
                      }
                    </div>
                    <span className={`font-body text-xs ${done ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                      {p.label}
                    </span>
                    {done && <span className="ml-auto text-green-500 font-display text-xs font-bold">✓</span>}
                  </div>
                )
              })}
              {/* Scan summary stats */}
              {scanMeta && (
                <div className="mt-3 pt-3 border-t border-amber-100 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Scanned', val: scanMeta.total_scanned, cls: 'text-gray-700' },
                    { label: 'CBOM OK', val: scanMeta.ok,            cls: 'text-green-600' },
                    { label: 'Errors',  val: scanMeta.errors,        cls: 'text-red-500'   },
                  ].map(({ label, val, cls }) => (
                    <div key={label}>
                      <p className={`font-display text-lg font-extrabold ${cls}`}>{val}</p>
                      <p className="font-body text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Diff summary */}
              {scanMeta?.diff && (
                <div className="mt-3 pt-3 border-t border-amber-100">
                  <p className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">File Merge Summary</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: '+ New domains',   val: scanMeta.diff.cbom?.added     ?? 0, cls: 'bg-green-100 text-green-700' },
                      { label: '~ Updated',       val: scanMeta.diff.cbom?.updated   ?? 0, cls: 'bg-amber-100 text-amber-700' },
                      { label: '= Unchanged',     val: scanMeta.diff.cbom?.unchanged ?? 0, cls: 'bg-gray-100 text-gray-600'   },
                      { label: '↩ Preserved',     val: scanMeta.diff.cbom?.preserved ?? 0, cls: 'bg-blue-100 text-blue-700'   },
                    ].map(({ label, val, cls }) => (
                      <div key={label} className={`flex items-center justify-between px-2 py-1 rounded ${cls}`}>
                        <span className="font-body text-xs">{label}</span>
                        <span className="font-display text-xs font-bold">{val}</span>
                      </div>
                    ))}
                  </div>
                  {(scanMeta.diff.subdomains?.added ?? 0) > 0 && (
                    <p className="font-body text-xs text-green-700 mt-1.5">
                      +{scanMeta.diff.subdomains.added} new subdomain(s) discovered
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────── */}
        <div className="col-span-8 space-y-3">

          {/* Live log terminal */}
          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="font-mono text-xs text-slate-400 ml-2">qrie.scanner — live output</span>
              </div>
              {scanning && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-400 rounded-full scanner-ping" />
                  <span className="font-mono text-xs text-green-400">SCANNING</span>
                </div>
              )}
              {hasResults && !scanning && <span className="font-mono text-xs text-green-400">✓ COMPLETE</span>}
            </div>
            <div ref={logRef}
              className="p-4 h-52 overflow-y-auto font-mono text-xs space-y-0.5"
              style={{ scrollBehavior: 'smooth' }}>
              {logs.length === 0 && !scanning && !hasResults && (
                <p className="text-slate-500">$ Waiting for scan to start...</p>
              )}
              {logs.map((line, i) => (
                <p key={i} className={
                  line.includes('[ERROR]') ? 'text-red-400' :
                  line.includes('[WARN]')  ? 'text-amber-400' :
                  line.includes('[DEBUG]') ? 'text-slate-400' :
                  line.includes('✅')      ? 'text-green-400 font-bold' :
                  'text-green-300'
                }>
                  {line}
                </p>
              ))}
              {scanning && (
                <p className="text-amber-400 animate-pulse">▌</p>
              )}
            </div>
          </div>

          {/* Results tabs */}
          {hasResults && (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="flex border-b border-amber-100 overflow-x-auto">
                {[
                  { key: 'cbom',           label: `CBOM (${cbomRecords.length})` },
                  { key: 'shadow',         label: `Shadow Crypto (${shadowRecords.length})` },
                  { key: 'subdomains',     label: `Subdomains (${subdomains.length})` },
                  { key: 'fingerprint',    label: 'HTTP Fingerprint' },
                  { key: 'classification', label: 'Asset Classification' },
                  { key: 'infrastructure', label: 'Infrastructure' },
                  { key: 'probes',         label: 'TLS Probes' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`px-4 py-3 font-display text-xs font-semibold whitespace-nowrap transition-colors
                      ${activeTab === key
                        ? 'bg-pnb-crimson text-white'
                        : 'text-gray-600 hover:bg-amber-50'
                      }`}>
                    {label}
                  </button>
                ))}
                {scanMeta && (
                  <div className="ml-auto flex items-center px-4">
                    <span className="font-body text-xs text-gray-400 whitespace-nowrap">
                      {scanMeta.scanned_at ? new Date(scanMeta.scanned_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* ── CBOM Records tab ── */}
              {activeTab === 'cbom' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-body">
                    <thead>
                      <tr className="bg-amber-50">
                        {['Asset','Asset Type','Confidence','Subject CN','IP','Port','TLS Ver','Min TLS','Cipher','Key Exch','PFS','Key Bits','Issuer CA','PQC Label','Status'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-pnb-crimson text-xs whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cbomRecords.map((r, i) => {
                        const ok     = r['Scan Status'] === 'ok'
                        const active = selectedRow === i
                        const atd    = r['Asset Type Details'] || {}
                        const atTypeColors = {
                          web_application: '#3b82f6', api: '#6366f1', web_server: '#0ea5e9',
                          database: '#f59e0b', mail_server: '#10b981', dns_server: '#8b5cf6',
                          cdn_proxy: '#ec4899', load_balancer: '#f97316', ssl_certificate: '#14b8a6',
                          unknown: '#94a3b8'
                        }
                        const atColor = atTypeColors[r['Asset Type']] || '#94a3b8'
                        return (
                          <tr key={i}
                            onClick={() => setSelectedRow(active ? null : i)}
                            className={`border-b border-amber-50 cursor-pointer transition-colors
                              ${active ? 'bg-amber-100/60' : i%2===0 ? 'bg-white/80 hover:bg-amber-50/50' : 'bg-red-50/10 hover:bg-amber-50/50'}`}>
                            <td className="px-3 py-2 font-semibold text-blue-700 whitespace-nowrap max-w-32 truncate">{r['Asset']}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="inline-flex items-center text-xs font-display font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `${atColor}22`, color: atColor }}>
                                {(r['Asset Type'] || 'unknown').replace(/_/g,' ')}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {atd.confidence && (
                                <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                                  atd.confidence === 'high'   ? 'bg-green-100 text-green-700' :
                                  atd.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>{atd.confidence}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap max-w-28 truncate">{r['Subject CN'] || '—'}</td>
                            <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{r['IP Address']}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded">{r['Port']}</span>
                            </td>
                            <td className={`px-3 py-2 font-mono font-bold whitespace-nowrap ${tlsColor(r['TLS Version'])}`}>
                              {r['TLS Version'] || '—'}
                            </td>
                            <td className={`px-3 py-2 font-mono whitespace-nowrap ${tlsColor(r['Minimum Supported TLS'])}`}>
                              {r['Minimum Supported TLS'] || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap max-w-36 truncate">
                              {r['Cipher Suite'] ? (
                                <span className={r['Cipher Suite'].includes('DES') || r['Cipher Suite'].includes('RC4') ? 'text-red-600 bg-red-50 px-1 rounded' : ''}>
                                  {r['Cipher Suite']}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r['Key Exchange Algorithm'] || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {r['PFS Status'] === 'Yes' ? <CheckCircle size={13} className="inline text-green-500" /> :
                               r['PFS Status'] === 'No'  ? <XCircle size={13} className="inline text-red-500" /> :
                               <AlertCircle size={13} className="inline text-gray-400" />}
                            </td>
                            <td className={`px-3 py-2 font-mono font-bold whitespace-nowrap ${keyColor(r['Key Size (Bits)'])}`}>
                              {r['Key Size (Bits)'] ? `${r['Key Size (Bits)']}b` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-28 truncate">
                              {(r['Issuer CA'] || '').replace(/^.*CN=/, '') || '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r['NIST PQC Readiness Label'] && (
                                <span className={`text-xs font-display font-bold px-1.5 py-0.5 rounded ${
                                  r['NIST PQC Readiness Label'] === 'PQC-Ready'          ? 'bg-green-100 text-green-700' :
                                  r['NIST PQC Readiness Label'] === 'Migration-Candidate' ? 'bg-blue-100 text-blue-700' :
                                  r['NIST PQC Readiness Label'] === 'Quantum-Vulnerable'  ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {r['NIST PQC Readiness Label']}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {ok
                                ? <CheckCircle size={14} className="inline text-green-500" />
                                : <XCircle size={14} className="inline text-red-500" />
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}


              {/* ── Shadow Crypto tab ── */}
              {activeTab === 'shadow' && (
                <div className="overflow-x-auto">
                  {shadowRecords.length === 0 ? (
                    <div className="p-8 text-center">
                      <Shield size={32} className="text-green-400 mx-auto mb-3" />
                      <p className="font-display text-sm font-bold text-green-700">No Shadow Crypto Detected</p>
                      <p className="font-body text-xs text-gray-500 mt-1">All scanned assets passed shadow crypto checks.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs font-body">
                      <thead>
                        <tr className="bg-red-50">
                          {['Asset','Port','TLS Ver','Cipher Suite','PFS','Key Bits','Severity','Shadow Crypto Reasons'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-red-700 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shadowRecords.map((r, i) => (
                          <tr key={i} className={`border-b border-red-50 ${i%2===0 ? 'bg-white/80' : 'bg-red-50/20'}`}>
                            <td className="px-3 py-2 font-semibold text-blue-700 whitespace-nowrap max-w-32 truncate">{r['Asset']}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded">{r['Port']}</span>
                            </td>
                            <td className={`px-3 py-2 font-mono font-bold ${tlsColor(r['TLS Version'])}`}>
                              {r['TLS Version'] || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-600 max-w-36 truncate">{r['Cipher Suite'] || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {r['PFS Status'] === 'Yes'
                                ? <CheckCircle size={13} className="inline text-green-500" />
                                : <XCircle size={13} className="inline text-red-500" />
                              }
                            </td>
                            <td className={`px-3 py-2 font-mono font-bold ${keyColor(r['Key Size (Bits)'])}`}>
                              {r['Key Size (Bits)'] ? `${r['Key Size (Bits)']}b` : '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <SeverityBadge severity={r['Shadow Crypto Severity'] || 'medium'} />
                            </td>
                            <td className="px-3 py-2">
                              <ul className="space-y-0.5">
                                {(r['Shadow Crypto Reasons'] || []).map((reason, j) => (
                                  <li key={j} className="text-red-600 font-body text-xs flex items-start gap-1">
                                    <span className="text-red-400 mt-0.5">•</span> {reason}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── Subdomains tab ── */}
              {activeTab === 'subdomains' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-body">
                    <thead>
                      <tr className="bg-amber-50">
                        {['#','FQDN','Source'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-display font-semibold text-pnb-crimson">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subdomains.map((fqdn, i) => (
                        <tr key={i} className={`border-b border-amber-50 ${i%2===0?'bg-white/80':'bg-amber-50/30'}`}>
                          <td className="px-4 py-2.5 text-gray-400 font-mono">{i+1}</td>
                          <td className="px-4 py-2.5 font-mono text-blue-700 font-semibold">{fqdn}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-blue-100 text-blue-700 font-display text-xs font-bold px-2 py-0.5 rounded">
                              {doEnum ? 'crt.sh / direct' : 'direct-input'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Asset Classification tab ── */}
              {activeTab === 'classification' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-body">
                    <thead>
                      <tr className="bg-violet-50">
                        {['Asset', 'Primary Type', 'Confidence', 'Detection Method', 'Secondary Types', 'Port', 'IP', 'Cipher Strength', 'SSL EV', 'API Type', 'Days Left'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-violet-700 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cbomRecords.map((r, i) => {
                        const atd = r['Asset Type Details'] || {}
                        const sslD = r['SSL Details'] || {}
                        const apiD = r['API Details'] || {}
                        const atTypeColors = {
                          web_application: '#3b82f6', api: '#6366f1', web_server: '#0ea5e9',
                          database: '#f59e0b', mail_server: '#10b981', dns_server: '#8b5cf6',
                          cdn_proxy: '#ec4899', load_balancer: '#f97316', ssl_certificate: '#14b8a6', unknown: '#94a3b8'
                        }
                        const atColor = atTypeColors[r['Asset Type']] || '#94a3b8'
                        return (
                          <tr key={i} className={`border-b border-violet-50 ${i%2===0?'bg-white/80':'bg-violet-50/20'}`}>
                            <td className="px-3 py-2.5 font-semibold text-blue-700 whitespace-nowrap max-w-32 truncate">{r['Asset']}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="inline-flex items-center text-xs font-display font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `${atColor}22`, color: atColor }}>
                                {(r['Asset Type'] || 'unknown').replace(/_/g,' ')}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                                atd.confidence === 'high'   ? 'bg-green-100 text-green-700' :
                                atd.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-400'
                              }`}>{atd.confidence || '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{atd.detection_method || '—'}</td>
                            <td className="px-3 py-2.5 max-w-40 truncate text-gray-500">{(atd.secondary_types || []).join(', ') || '—'}</td>
                            <td className="px-3 py-2.5">
                              <span className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded">{r['Port']}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-gray-600">{r['IP Address'] || '—'}</td>
                            <td className="px-3 py-2.5">
                              <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                                sslD.cipher_strength === 'Strong'   ? 'bg-green-100 text-green-700' :
                                sslD.cipher_strength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                                sslD.cipher_strength === 'Weak'     ? 'bg-red-100   text-red-700'   :
                                'bg-gray-100 text-gray-400'
                              }`}>{sslD.cipher_strength || '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {sslD.is_ev ? <span className="text-green-600 font-bold">✓ EV</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              {apiD.is_api
                                ? <span className="bg-indigo-100 text-indigo-700 font-display font-bold text-xs px-1.5 py-0.5 rounded">{apiD.api_type || 'REST'}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-center"
                              style={{ color: sslD.days_until_expiry === undefined ? '#94a3b8' : sslD.days_until_expiry < 0 ? '#dc2626' : sslD.days_until_expiry < 30 ? '#f59e0b' : '#16a34a' }}>
                              {sslD.days_until_expiry !== undefined ? `${sslD.days_until_expiry}d` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Infrastructure tab ── */}
              {activeTab === 'infrastructure' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-body">
                    <thead>
                      <tr className="bg-blue-50">
                        {['Asset', 'Port', 'Asset Type', 'CDN Provider', 'WAF', 'Load Balanced', 'Reverse Proxy', 'Detected Services', 'Service Type', 'Subnet', 'Port Category', 'API Type'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-blue-700 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cbomRecords.map((r, i) => {
                        const infra = r['Infrastructure'] || {}
                        const nd    = r['Network Details'] || {}
                        const apiD  = r['API Details'] || {}
                        return (
                          <tr key={i} className={`border-b border-blue-50 ${i%2===0?'bg-white/80':'bg-blue-50/20'}`}>
                            <td className="px-3 py-2.5 font-semibold text-blue-700 whitespace-nowrap max-w-32 truncate">{r['Asset']}</td>
                            <td className="px-3 py-2.5">
                              <span className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded">{r['Port']}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                              {(r['Asset Type'] || 'unknown').replace(/_/g,' ')}
                            </td>
                            <td className="px-3 py-2.5">
                              {infra.cdn_provider
                                ? <span className="bg-blue-100 text-blue-700 font-display font-bold text-xs px-1.5 py-0.5 rounded">☁ {infra.cdn_provider}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {infra.waf_detected ? <span className="text-amber-600 font-bold">🛡 Yes</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {infra.load_balanced ? <span className="text-purple-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {infra.reverse_proxy ? <span className="text-indigo-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 max-w-40 truncate text-gray-500">
                              {(infra.detected_services || []).join(', ') || '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              {nd.service_type
                                ? <span className="bg-purple-100 text-purple-700 font-display font-bold text-xs px-1.5 py-0.5 rounded">{nd.service_type}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-gray-500">{nd.ip_subnet || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500">{nd.port_category || '—'}</td>
                            <td className="px-3 py-2.5">
                              {apiD.is_api
                                ? <span className="bg-indigo-100 text-indigo-700 font-display font-bold text-xs px-1.5 py-0.5 rounded">{apiD.api_type || 'REST'}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── HTTP Fingerprint tab ── */}
              {activeTab === 'fingerprint' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-body">
                    <thead>
                      <tr className="bg-indigo-50">
                        {['Asset','HTTP Status','Web Server','X-Powered-By','Detected OS','OS Confidence','Page Title','Technology Stack'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-display font-semibold text-indigo-700 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRecords.map((r, i) => {
                        const status = r['HTTP Status']
                        const statusCls = status >= 200 && status < 300 ? 'text-green-600'
                          : status >= 300 && status < 400 ? 'text-blue-600'
                          : status >= 400 ? 'text-red-600' : 'text-gray-400'
                        return (
                          <tr key={i} className={`border-b border-indigo-50 ${i%2===0?'bg-white/80':'bg-indigo-50/20'}`}>
                            <td className="px-3 py-2 font-semibold text-blue-700 whitespace-nowrap max-w-32 truncate">{r['Asset']}</td>
                            <td className={`px-3 py-2 font-mono font-bold ${statusCls}`}>
                              {status ?? '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-600 max-w-28 truncate">{r['Web Server'] || '—'}</td>
                            <td className="px-3 py-2 font-mono text-gray-600 max-w-28 truncate">{r['X-Powered-By'] || '—'}</td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r['Detected OS'] || '—'}</td>
                            <td className="px-3 py-2">
                              {r['OS Confidence'] && (
                                <span className={`font-display text-xs font-bold px-1.5 py-0.5 rounded ${
                                  r['OS Confidence'] === 'high'   ? 'bg-green-100 text-green-700' :
                                  r['OS Confidence'] === 'medium' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>{r['OS Confidence']}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-36 truncate" title={r['Page Title'] || ''}>
                              {r['Page Title'] || '—'}
                            </td>
                            <td className="px-3 py-2 max-w-48">
                              <div className="flex flex-wrap">
                                {(r['Technology Hints'] || []).slice(0, 4).map((t, j) => (
                                  <TechBadge key={j} label={t} />
                                ))}
                                {(r['Technology Hints'] || []).length > 4 && (
                                  <span className="text-gray-400 text-xs">+{r['Technology Hints'].length - 4}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── TLS Probe Details tab ── */}
              {activeTab === 'probes' && (
                <div className="p-4 space-y-3">
                  <p className="font-body text-xs text-gray-500">
                    TLS version probes from weakest (TLSv1.0) → strongest (TLSv1.3) per asset
                  </p>
                  {cbomRecords.map((r, i) => (
                    <div key={i} className="border border-amber-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-amber-50 flex items-center justify-between">
                        <div>
                          <span className="font-display text-xs font-bold text-pnb-crimson">{r['Asset']}</span>
                          {r['Subject CN'] && (
                            <span className="ml-2 font-mono text-xs text-gray-500">({r['Subject CN']})</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {['TLSv1.0','TLSv1.1','TLSv1.2','TLSv1.3'].map(v => {
                            const supported = (r['Supported TLS Versions'] || []).includes(v)
                            return (
                              <span key={v} className={`font-mono text-xs font-bold px-2 py-0.5 rounded
                                ${supported
                                  ? v === 'TLSv1.3' ? 'bg-green-100 text-green-700'
                                  : v === 'TLSv1.2' ? 'bg-blue-100 text-blue-700'
                                  : 'bg-red-100 text-red-600'
                                  : 'bg-gray-100 text-gray-400'
                                }`}>
                                {v}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-0 divide-x divide-amber-50">
                        {[
                          ['Cipher Suite',    r['Cipher Suite']],
                          ['Key Exchange',    r['Key Exchange Algorithm']],
                          ['PFS',             r['PFS Status']],
                          ['Latency',         r['Handshake Latency'] ? `${r['Handshake Latency']} ms` : '—'],
                          ['Cert Expiry',     r['Certificate Validity (Not Before/After)']?.['Not After']
                                               ? new Date(r['Certificate Validity (Not Before/After)']['Not After']).toLocaleDateString()
                                               : '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="px-3 py-2 text-xs">
                            <p className="font-display font-semibold text-gray-500 text-xs">{k}</p>
                            <p className={`font-mono font-bold mt-0.5 ${
                              k === 'PFS' ? (v === 'Yes' ? 'text-green-600' : 'text-red-600') : 'text-gray-800'
                            }`}>{v || '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!scanning && !hasResults && (
            <div className="glass-card rounded-xl p-12 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Radar size={32} className="text-pnb-amber" />
              </div>
              <p className="font-display text-sm font-bold text-pnb-crimson">Ready to Scan</p>
              <p className="font-body text-xs text-gray-500 mt-2 max-w-sm mx-auto">
                Add targets on the left (domains or IPs), configure ports and timeouts,
                then click <strong>Run Scan</strong> to start.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mt-5">
                {[
                  'TLSv1.0 → 1.3 probe',
                  'Cert extraction',
                  'HTTP fingerprinting',
                  'OS detection',
                  'Asset classification (12 types)',
                  'CDN / WAF / LB detection',
                  'API endpoint detection',
                  'SSL Details (EV, wildcard, SANs)',
                  'Network subnet grouping',
                  'Infrastructure analysis',
                  'Shadow crypto detection',
                  'CBOM + enriched JSON output',
                  'Subdomain enum (crt.sh)',
                ].map(f => (
                  <div key={f} className="flex items-center gap-1.5 text-xs font-body text-gray-500">
                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
