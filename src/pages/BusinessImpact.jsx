import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Zap, TrendingUp, AlertTriangle, Target } from 'lucide-react'
import dataAPI from '../dataAPI'

// ─── Simulation Engine Logic (mirrors simulation_engine.py) ──────────────────

const CRQC_YEARS = { Aggressive: 2030, Moderate: 2035, Conservative: 2040 }
const SENSITIVITY_MAP = { low: 1, medium: 2, high: 3, critical: 4 }

function determineSensitivity(name) {
  const n = name.toLowerCase()
  if (n.includes('api'))         return 'medium'
  if (n.includes('auth') || n.includes('login')) return 'high'
  if (n.includes('core') || n.includes('transaction')) return 'critical'
  return 'low'
}

function deriveHEI(asset) {
  let score = 50
  if (asset.tls === 'TLSv1.2')      score += 20
  else if (asset.tls === 'TLSv1.3') score -= 10
  else                               score += 30
  if (asset.keyBits < 2048) score += 20
  if (!asset.pfs)           score += 15
  return Math.max(0, Math.min(100, score))
}

function calcExposure(hei, years, sensitivity) {
  return +(( hei / 100 ) * years * SENSITIVITY_MAP[sensitivity]).toFixed(2)
}

function calcQVaR(hei, assetValue, shelfLife, scenario) {
  const prob = { Aggressive: 0.7, Moderate: 0.5, Conservative: 0.3 }[scenario]
  return Math.round((hei / 100) * assetValue * shelfLife * prob)
}

function businessRisk(qvar) {
  if (qvar > 50_000_000) return { label: 'Critical Financial Risk', color: '#7c0000' }
  if (qvar > 20_000_000) return { label: 'High Financial Risk',     color: '#dc2626' }
  if (qvar >  5_000_000) return { label: 'Moderate Financial Risk', color: '#d97706' }
  return                          { label: 'Low Financial Risk',     color: '#16a34a' }
}

// ─── Dataset (dynamically loaded from PNB) ──────────────────────────────────────────────────────────────────

// Build graph nodes + edges for a given asset
function buildGraph(asset, scenario) {
  const blastCount = { Aggressive: 4, Moderate: 3, Conservative: 2 }[scenario]

  // Flatten blast levels with caps per scenario
  const allTargets = [
    ...asset.blast.direct,
    ...asset.blast.indirect.slice(0, blastCount >= 3 ? undefined : 0),
    ...asset.blast.cascading.slice(0, blastCount >= 4 ? undefined : 0),
  ]

  const nodes = [
    { id: asset.id, label: asset.name.split('.')[0], type: 'entry',
      x: 370, y: 190, color: '#7c0000', ring: '#dc2626' },
    ...asset.blast.direct.map((d, i) => ({
      id: d, label: d.replace(asset.id + '_', '').replace('api_','').toUpperCase(),
      type: 'direct', x: 180 + i * 160, y: 310,
      color: '#dc2626', ring: '#ef4444',
      visible: blastCount >= 2,
    })),
    ...asset.blast.indirect.map((d, i) => ({
      id: d, label: d.replace(asset.id + '_', '').replace(/_/g,' ').toUpperCase().slice(0,8),
      type: 'indirect', x: 100 + i * 200, y: 430,
      color: '#d97706', ring: '#f59e0b',
      visible: blastCount >= 3,
    })),
    ...asset.blast.cascading.map((d, i) => ({
      id: d, label: d.replace(asset.id + '_', '').replace(/_/g,' ').toUpperCase().slice(0,8),
      type: 'cascading', x: 120 + i * 180, y: 550,
      color: '#92400e', ring: '#b45309',
      visible: blastCount >= 4,
    })),
  ]

  const edges = [
    ...asset.blast.direct.map(d => ({ from: asset.id, to: d, visible: blastCount >= 2 })),
    ...asset.blast.indirect.map(d => ({ from: asset.blast.direct[0] || asset.id, to: d, visible: blastCount >= 3 })),
    ...asset.blast.cascading.map((d,i) => ({
      from: asset.blast.indirect[i] || asset.blast.direct[0] || asset.id, to: d, visible: blastCount >= 4
    })),
  ]

  return { nodes, edges }
}

// ─── Animated Blast Radius Graph ─────────────────────────────────────────────

function BlastGraph({ asset, scenario }) {
  const [litNodes, setLitNodes]   = useState(new Set([asset.id]))
  const [litEdges, setLitEdges]   = useState(new Set())
  const [playing,  setPlaying]    = useState(false)
  const timerRef = useRef(null)

  const { nodes, edges } = buildGraph(asset, scenario)
  const visibleNodes = nodes.filter(n => n.visible !== false)
  const visibleEdges = edges.filter(e => e.visible !== false)

  // Reset when asset or scenario changes
  useEffect(() => {
    clearAllTimers()
    setLitNodes(new Set([asset.id]))
    setLitEdges(new Set())
    setPlaying(false)
  }, [asset.id, scenario])

  function clearAllTimers() {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  function runAnimation() {
    if (playing) return
    setPlaying(true)
    setLitNodes(new Set([asset.id]))
    setLitEdges(new Set())

    // Propagate wave-by-wave
    const waves = [
      asset.blast.direct.slice(0, scenario === 'Conservative' ? 0 : undefined),
      asset.blast.indirect.slice(0, scenario === 'Aggressive' ? undefined : scenario === 'Moderate' ? undefined : 0),
      asset.blast.cascading.slice(0, scenario === 'Aggressive' ? undefined : 0),
    ].filter(w => w.length > 0)

    let delay = 600
    waves.forEach(wave => {
      timerRef.current = setTimeout(() => {
        setLitNodes(prev => {
          const next = new Set(prev)
          wave.forEach(id => next.add(id))
          return next
        })
        setLitEdges(prev => {
          const next = new Set(prev)
          // find edges whose 'to' is in this wave
          visibleEdges.forEach(e => {
            if (wave.includes(e.to)) next.add(e.to)
          })
          return next
        })
      }, delay)
      delay += 900
    })

    timerRef.current = setTimeout(() => setPlaying(false), delay + 200)
  }

  function findNode(id) { return visibleNodes.find(n => n.id === id) }

  return (
    <div className="relative">
      {/* Play button */}
      <div className="flex items-center justify-between mb-2">
        <p className="font-display text-xs text-pnb-crimson font-semibold uppercase tracking-wide">
          Blast Radius — Attack Propagation
        </p>
        <button
          onClick={runAnimation}
          disabled={playing}
          className={`font-display text-xs font-bold px-4 py-1.5 rounded-lg transition-all
            ${playing
              ? 'bg-amber-100 text-amber-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-pnb-crimson to-red-800 text-white hover:from-red-800 hover:to-pnb-crimson shadow'
            }`}
        >
          {playing ? '⚡ Propagating...' : '▶ Simulate Attack'}
        </button>
      </div>

      {/* SVG graph */}
      <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
        <svg width="100%" viewBox="0 0 740 610" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[1,2,3,4,5,6,7,8,9].map(i => (
            <line key={`h${i}`} x1="0" y1={i*60} x2="740" y2={i*60}
              stroke="#1e293b" strokeWidth="1" />
          ))}
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
            <line key={`v${i}`} x1={i*60} y1="0" x2={i*60} y2="610"
              stroke="#1e293b" strokeWidth="1" />
          ))}

          {/* Legend */}
          {[['#7c0000','Entry Point'],['#dc2626','Direct Impact'],['#d97706','Indirect'],['#92400e','Cascading']].map(([c,l],i) => (
            <g key={l}>
              <circle cx={30} cy={20 + i * 20} r={7} fill={c} opacity="0.85" />
              <text x={42} y={25 + i * 20} fill="#94a3b8" fontSize="11" fontFamily="DM Sans">{l}</text>
            </g>
          ))}

          {/* Scenario label */}
          <text x="720" y="20" textAnchor="end" fill="#f59e0b" fontSize="12" fontFamily="Oxanium" fontWeight="700">
            {scenario}
          </text>

          {/* Edges */}
          {visibleEdges.map(e => {
            const from = findNode(e.from)
            const to   = findNode(e.to)
            if (!from || !to) return null
            const active = litEdges.has(e.to)
            return (
              <line key={`${e.from}-${e.to}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={active ? to.ring : '#334155'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray={active ? 'none' : '6 4'}
                opacity={active ? 0.9 : 0.4}
                style={{ transition: 'all 0.5s ease' }}
              />
            )
          })}

          {/* Nodes */}
          {visibleNodes.map(node => {
            const lit = litNodes.has(node.id)
            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}
                style={{ transition: 'all 0.4s ease' }}>
                {/* Pulse ring when lit */}
                {lit && (
                  <circle r="36" fill="none" stroke={node.ring} strokeWidth="1.5" opacity="0.25"
                    className="scanner-ping" />
                )}
                {/* Outer ring */}
                <circle r="26" fill="none"
                  stroke={lit ? node.ring : '#334155'}
                  strokeWidth={lit ? 2 : 1}
                  opacity={lit ? 0.6 : 0.3}
                  style={{ transition: 'all 0.4s ease' }}
                />
                {/* Main circle */}
                <circle r="22"
                  fill={lit ? node.color : '#1e293b'}
                  stroke={lit ? node.ring : '#475569'}
                  strokeWidth={lit ? 2.5 : 1}
                  style={{ transition: 'all 0.4s ease' }}
                  className={lit ? 'blast-node-lit' : ''}
                />
                {/* Label */}
                <text y="5" textAnchor="middle" fill={lit ? '#fcd34d' : '#94a3b8'}
                  fontSize="9" fontFamily="Oxanium" fontWeight="700"
                  style={{ transition: 'all 0.4s ease' }}>
                  {node.label.slice(0,8)}
                </text>
                {/* Type badge */}
                <text y="40" textAnchor="middle" fill={lit ? node.ring : '#475569'}
                  fontSize="8" fontFamily="DM Sans"
                  style={{ transition: 'all 0.4s ease' }}>
                  {node.type}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Affected count */}
      <div className="flex items-center gap-4 mt-3">
        {Object.entries(CRQC_YEARS).map(([sc]) => {
          const cnt = { Aggressive: 4, Moderate: 3, Conservative: 2 }[sc]
          const active = sc === scenario
          return (
            <div key={sc}
              className={`flex-1 rounded-xl p-2.5 text-center border transition-all
                ${active ? 'bg-pnb-crimson border-red-700 shadow-lg' : 'bg-white/60 border-amber-200'}`}>
              <p className={`font-display text-xs font-bold ${active ? 'text-amber-300' : 'text-pnb-crimson'}`}>{sc}</p>
              <p className={`font-display text-xl font-extrabold ${active ? 'text-white' : 'text-gray-700'}`}>{cnt}</p>
              <p className={`font-body text-xs ${active ? 'text-red-200' : 'text-gray-500'}`}>systems impacted</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Q-VaR Chart ─────────────────────────────────────────────────────────────

function QVarPanel({ asset, scenario }) {
  const sens = determineSensitivity(asset.name)
  const hei  = asset.hei

  const chartData = Object.entries(CRQC_YEARS).map(([sc, yr]) => {
    const years = Math.max(0, yr - 2020)
    const exp   = calcExposure(hei, years, sens)
    const qvar  = calcQVaR(hei, asset.value, asset.shelf, sc)
    return { scenario: sc, years, exposure: exp, qvar, qvarCr: +(qvar / 10_000_000).toFixed(2) }
  })

  const current = chartData.find(d => d.scenario === scenario)
  const { label: riskLabel, color: riskColor } = businessRisk(current.qvar)

  return (
    <div className="space-y-3">
      {/* Q-VaR highlight card */}
      <div className="qvar-card bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-600">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-xs text-amber-400 uppercase tracking-widest mb-1">Q-VaR ({scenario})</p>
            <p className="font-display text-4xl font-extrabold text-white">
              ₹{(current.qvar / 10_000_000).toFixed(2)} Cr
            </p>
            <p className="font-body text-xs text-slate-400 mt-1">Quantum Value-at-Risk</p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1.5 rounded-xl font-display text-xs font-bold text-white"
              style={{ background: riskColor }}>
              {riskLabel}
            </span>
            <p className="font-body text-xs text-slate-400 mt-2">HEI: <span className="text-amber-400 font-bold">{hei}</span></p>
            <p className="font-body text-xs text-slate-400">Sensitivity: <span className="text-amber-400 font-bold capitalize">{sens}</span></p>
            <p className="font-body text-xs text-slate-400">Exposure: <span className="text-amber-400 font-bold">{current.exposure}</span></p>
          </div>
        </div>

        {/* HEI bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs font-body mb-1">
            <span className="text-slate-400">Harvest Exposure Index (HEI)</span>
            <span className="font-display font-bold" style={{ color: hei > 70 ? '#dc2626' : hei > 40 ? '#d97706' : '#16a34a' }}>
              {hei}/100
            </span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${hei}%`,
                background: hei > 70 ? '#dc2626' : hei > 40 ? '#d97706' : '#16a34a'
              }} />
          </div>
        </div>
      </div>

      {/* Q-VaR across scenarios chart */}
      <div className="glass-card rounded-xl p-4">
        <p className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
          Q-VaR Across CRQC Scenarios (₹ Crore)
        </p>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="scenario" tick={{ fontSize: 10, fontFamily: 'Oxanium', fontWeight: 700 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip
              formatter={(v) => [`₹${v} Cr`, 'Q-VaR']}
              contentStyle={{ fontSize: 11, fontFamily: 'DM Sans' }}
            />
            <Bar dataKey="qvarCr" radius={[4,4,0,0]}>
              {chartData.map((d) => (
                <Cell key={d.scenario}
                  fill={d.scenario === scenario ? '#dc2626' : d.scenario === 'Aggressive' ? '#7c0000' : '#d97706'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CRQC timeline */}
      <div className="glass-card rounded-xl p-4">
        <p className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide mb-3">
          CRQC Arrival Scenarios
        </p>
        {chartData.map(d => (
          <div key={d.scenario} className={`flex items-center gap-3 mb-2.5 p-2.5 rounded-lg border transition-all
              ${d.scenario === scenario ? 'bg-pnb-crimson/10 border-pnb-crimson/30' : 'border-transparent'}`}>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: d.scenario === 'Aggressive' ? '#7c0000' : d.scenario === 'Moderate' ? '#d97706' : '#16a34a' }} />
            <div className="flex-1">
              <div className="flex justify-between">
                <span className="font-display text-xs font-bold text-gray-700">{d.scenario} — {CRQC_YEARS[d.scenario]}</span>
                <span className="font-display text-xs font-bold text-pnb-crimson">₹{d.qvarCr} Cr</span>
              </div>
              <div className="flex justify-between text-xs font-body text-gray-500 mt-0.5">
                <span>{d.years} yrs exposure window</span>
                <span>Exp score: {d.exposure}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BusinessImpact() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [scenario,   setScenario]   = useState('Moderate')

  useEffect(() => {
    const fetchImpactData = async () => {
      try {
        const res = await dataAPI.getBusinessImpact();
        if (res.success && res.assets && res.assets.length > 0) {
          setAssets(res.assets);
          setSelectedId(res.assets[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch business impact data', err);
      }
    };
    fetchImpactData();
  }, [])

  if (assets.length === 0 || !selectedId) {
    return <div className="p-8 flex items-center justify-center min-h-[400px] text-pnb-crimson font-display font-semibold tracking-wide bg-amber-50/50 rounded-2xl border border-amber-200">Loading Enterprise Impact Simulation Data...</div>
  }

  const selectedAsset = assets.find(a => a.id === selectedId) || assets[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-pnb-crimson flex items-center gap-2">
            <Zap size={20} className="text-amber-500" /> Business Impact Analysis
          </h1>
          <p className="font-body text-sm text-gray-600 mt-0.5">
            Blast Radius · Q-VaR Financial Exposure · CRQC Scenario Simulation
          </p>
        </div>

        {/* Scenario toggle */}
        <div className="flex items-center gap-1 bg-white/80 border border-amber-200 rounded-xl p-1">
          {Object.keys(CRQC_YEARS).map(sc => (
            <button key={sc} onClick={() => setScenario(sc)}
              className={`font-display text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200
                ${scenario === sc
                  ? 'bg-gradient-to-r from-pnb-crimson to-red-800 text-white shadow-md'
                  : 'text-gray-600 hover:bg-amber-50'
                }`}>
              {sc}
            </button>
          ))}
        </div>
      </div>

      {/* CRQC year info strip */}
      <div className="glass-card rounded-xl px-5 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-pnb-crimson" />
          <span className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
            CRQC Arrival:
          </span>
          <span className="font-display text-sm font-extrabold text-amber-600">
            {CRQC_YEARS[scenario]}
          </span>
        </div>
        <div className="h-4 w-px bg-amber-200" />
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="font-body text-xs text-gray-600">
            Assets vulnerable to "Harvest Now, Decrypt Later" attacks
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {assets.map(a => {
            const sens = determineSensitivity(a.name)
            const qvar = calcQVaR(a.hei, a.value, a.shelf, scenario)
            const { color } = businessRisk(qvar)
            return (
              <div key={a.id} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="font-body text-xs text-gray-600">{a.name.split('.')[0]}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-12 gap-4">

        {/* LEFT: Asset list */}
        <div className="col-span-3 space-y-2">
          <p className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide px-1">
            Select Asset
          </p>
          {assets.map(asset => {
            const sens  = determineSensitivity(asset.name)
            const qvar  = calcQVaR(asset.hei, asset.value, asset.shelf, scenario)
            const { label: rl, color: rc } = businessRisk(qvar)
            const active = selectedId === asset.id
            return (
              <button key={asset.id} onClick={() => setSelectedId(asset.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200
                  ${active
                    ? 'bg-gradient-to-r from-pnb-crimson to-red-900 border-red-700 shadow-lg shadow-red-100'
                    : 'glass-card border-amber-100 hover:border-amber-300 hover:shadow-md'
                  }`}>
                <div className="flex items-start justify-between gap-1">
                  <p className={`font-display text-xs font-bold leading-tight ${active ? 'text-amber-300' : 'text-pnb-crimson'}`}>
                    {asset.name.split('.')[0]}
                  </p>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: rc }} />
                </div>
                <p className={`font-body text-xs truncate mt-0.5 ${active ? 'text-red-200' : 'text-gray-500'}`}>
                  {asset.name}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`font-display text-xs font-bold ${active ? 'text-white' : 'text-gray-700'}`}>
                    HEI: {asset.hei}
                  </span>
                  <span className={`font-display text-xs ${active ? 'text-amber-300' : 'text-pnb-amber'} font-bold`}>
                    ₹{(qvar/10_000_000).toFixed(1)}Cr
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: active ? 'rgba(255,255,255,0.2)' : '#f3f4f6' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${asset.hei}%`, background: rc }} />
                </div>
                <p className={`font-body text-xs mt-1 capitalize ${active ? 'text-red-200' : 'text-gray-400'}`}>
                  {sens} sensitivity · {asset.tls}
                </p>
              </button>
            )
          })}
        </div>

        {/* MIDDLE: Blast radius graph */}
        <div className="col-span-5">
          <BlastGraph asset={selectedAsset} scenario={scenario} />
        </div>

        {/* RIGHT: Q-VaR + CRQC */}
        <div className="col-span-4">
          <QVarPanel asset={selectedAsset} scenario={scenario} />
        </div>
      </div>

      {/* BOTTOM STATS ROW */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-amber-100">
          {[
            {
              label: 'HEI Score', icon: '🔥',
              value: selectedAsset.hei,
              sub: selectedAsset.hei > 70 ? 'High Risk' : selectedAsset.hei > 40 ? 'Medium Risk' : 'Low Risk',
              color: selectedAsset.hei > 70 ? '#dc2626' : selectedAsset.hei > 40 ? '#d97706' : '#16a34a',
            },
            {
              label: 'Q-VaR Exposure', icon: '💰',
              value: `₹${(calcQVaR(selectedAsset.hei, selectedAsset.value, selectedAsset.shelf, scenario)/10_000_000).toFixed(2)} Cr`,
              sub: `${scenario} scenario`,
              color: '#1d4ed8',
            },
            {
              label: 'Exposure Score', icon: '📈',
              value: calcExposure(selectedAsset.hei, Math.max(0, CRQC_YEARS[scenario] - 2020), determineSensitivity(selectedAsset.name)),
              sub: `${Math.max(0, CRQC_YEARS[scenario] - 2020)} yr window`,
              color: '#7c3aed',
            },
            {
              label: 'Risk Level', icon: '⚠',
              value: businessRisk(calcQVaR(selectedAsset.hei, selectedAsset.value, selectedAsset.shelf, scenario)).label,
              sub: `CRQC ${CRQC_YEARS[scenario]}`,
              color: businessRisk(calcQVaR(selectedAsset.hei, selectedAsset.value, selectedAsset.shelf, scenario)).color,
            },
          ].map(({ label, icon, value, sub, color }) => (
            <div key={label} className="p-5 text-center">
              <div className="text-2xl mb-1">{icon}</div>
              <p className="font-display text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
              <p className="font-display font-extrabold text-xl" style={{ color }}>{value}</p>
              <p className="font-body text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* All assets summary table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-100">
          <h3 className="font-display text-xs font-semibold text-pnb-crimson uppercase tracking-wide">
            Full Asset Risk Matrix — {scenario} Scenario (CRQC {CRQC_YEARS[scenario]})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="bg-gradient-to-r from-pnb-crimson to-red-800 text-white">
                {['Asset','TLS','Key Bits','HEI','Sensitivity','Years Exposed','Exposure Score','Q-VaR (₹ Cr)','Business Risk','Blast Nodes'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-display font-semibold tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => {
                const sens  = determineSensitivity(a.name)
                const years = Math.max(0, CRQC_YEARS[scenario] - 2020)
                const exp   = calcExposure(a.hei, years, sens)
                const qvar  = calcQVaR(a.hei, a.value, a.shelf, scenario)
                const { label: rl, color: rc } = businessRisk(qvar)
                const blastCount = { Aggressive: 4, Moderate: 3, Conservative: 2 }[scenario]
                const nodeCount  = 1 + a.blast.direct.length +
                  (blastCount >= 3 ? a.blast.indirect.length : 0) +
                  (blastCount >= 4 ? a.blast.cascading.length : 0)
                const isActive = a.id === selectedId
                return (
                  <tr key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`border-b border-amber-50 cursor-pointer transition-colors
                      ${isActive ? 'bg-amber-100/60 font-semibold' : i%2===0 ? 'bg-white/80 hover:bg-amber-50' : 'bg-red-50/10 hover:bg-amber-50'}`}>
                    <td className="px-3 py-2.5 text-blue-700 font-semibold">{a.name.split('.')[0]}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-mono font-bold ${a.tls === 'TLSv1.3' ? 'text-green-600' : a.tls === 'TLSv1.1' ? 'text-red-600' : 'text-amber-600'}`}>
                        {a.tls}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-gray-700">{a.keyBits}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden w-12">
                          <div className="h-full rounded-full"
                            style={{ width:`${a.hei}%`, background: a.hei>70?'#dc2626':a.hei>40?'#d97706':'#16a34a' }} />
                        </div>
                        <span className="font-display font-bold" style={{ color: a.hei>70?'#dc2626':a.hei>40?'#d97706':'#16a34a' }}>
                          {a.hei}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 capitalize text-gray-700">{sens}</td>
                    <td className="px-3 py-2.5 text-gray-700">{years} yrs</td>
                    <td className="px-3 py-2.5 font-display font-bold text-purple-700">{exp}</td>
                    <td className="px-3 py-2.5 font-display font-extrabold text-pnb-crimson">
                      ₹{(qvar/10_000_000).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-white text-xs font-display font-bold" style={{ background: rc }}>
                        {rl.split(' ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-display font-extrabold text-sm ${nodeCount >= 5 ? 'text-red-600' : nodeCount >= 4 ? 'text-amber-600' : 'text-green-600'}`}>
                        {nodeCount}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
