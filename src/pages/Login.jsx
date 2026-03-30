import { useState } from 'react'
import PNBShield from '../components/PNBShield.jsx'
import { Eye, EyeOff, Lock, User, Cpu } from 'lucide-react'

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('hackathon@pnb.com')
  const [password, setPassword] = useState('')
  const [show, setShow]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTimeout(() => {
      if (email === 'hackathon@pnb.com' && password === 'admin123') {
        onLogin()
      } else {
        setError('Invalid credentials. Please use hackathon@pnb.com / admin123.')
        setLoading(false)
      }
    }, 1200)
  }

  return (
    <div className="login-bg h-screen w-screen flex overflow-hidden relative">

      {/* Animated scan line */}
      <div className="scan-line" style={{ zIndex: 0 }} />

      {/* Decorative grid */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#F59E0B 1px, transparent 1px), linear-gradient(90deg, #F59E0B 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      />

      {/* Left — Login Form */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-12">

        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div key={i}
              className="absolute w-1 h-1 bg-amber-400 rounded-full opacity-30"
              style={{
                left: `${10 + i * 12}%`,
                top:  `${20 + (i % 3) * 25}%`,
                animation: `pulse-red ${1.5 + i * 0.3}s ease-in-out infinite`
              }}
            />
          ))}
        </div>

        <div className="glass-card rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-amber-200/50">
          {/* Logo top */}
          <div className="flex justify-center mb-6">
            <PNBShield size={72} />
          </div>

          <h2 className="font-display text-2xl font-bold text-pnb-crimson text-center mb-1">
            QRIE Portal
          </h2>
          <p className="text-xs text-pnb-amber text-center mb-6 font-body tracking-wider uppercase">
            Quantum Risk Intelligence Engine
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="font-display text-xs text-pnb-crimson font-semibold uppercase tracking-wider mb-1 block">
                Email / Username
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pnb-amber" />
                <input
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="hackathon@pnb.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-amber-50 border border-amber-200 rounded-lg
                             font-body text-pnb-crimson placeholder-red-300 focus:outline-none
                             focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="font-display text-xs text-pnb-crimson font-semibold uppercase tracking-wider mb-1 block">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pnb-amber" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="admin123"
                  className="w-full pl-9 pr-10 py-2.5 text-sm bg-amber-50 border border-amber-200 rounded-lg
                             font-body text-pnb-crimson placeholder-red-300 focus:outline-none
                             focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pnb-amber">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="text-xs text-pnb-amber hover:text-pnb-crimson font-body">
                Forgot Password?
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-pnb-gold to-pnb-amber text-white font-display
                         font-semibold text-sm rounded-lg hover:from-pnb-amber hover:to-pnb-crimson
                         transition-all duration-300 shadow-lg disabled:opacity-70 tracking-wide"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Cpu size={14} className="animate-spin" /> Authenticating...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      {/* Right — Branding */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-right pr-16">
        {/* Logos row */}
        <div className="flex items-center gap-4 mb-10 opacity-80">
          {['PSB', 'IIT', 'RBI', 'DSCI'].map(name => (
            <div key={name}
              className="w-12 h-12 rounded-full bg-white/10 border border-white/20
                         flex items-center justify-center font-display text-xs text-white font-bold">
              {name}
            </div>
          ))}
        </div>

        <p className="font-display text-amber-300 text-lg font-semibold tracking-widest uppercase mb-2">
          PSB Hackathon Series
        </p>
        <h1 className="font-display text-5xl font-extrabold text-amber-400 leading-tight mb-2">
          PSB Cybersecurity
        </h1>
        <h1 className="font-display text-5xl font-extrabold text-amber-400 leading-tight mb-6">
          Hackathon 2026
        </h1>
        <p className="font-display text-white text-xl tracking-widest">
          Cyber Innovation Begins
        </p>

        {/* Big shield decoration */}
        <div className="mt-10 opacity-30">
          <PNBShield size={180} />
        </div>

        <p className="font-display text-xs text-amber-300/60 mt-4 tracking-widest uppercase">
          In collaboration with IIT Kanpur
        </p>
      </div>
    </div>
  )
}
