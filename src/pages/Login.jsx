import { useEffect, useRef, useState } from 'react'
import PNBShield from '../components/PNBShield.jsx'
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Cpu,
  KeyRound,
  Copy,
  RefreshCw,
  CheckCircle2,
  QrCode,
  X,
  ShieldCheck
} from 'lucide-react'
import {
  beginPasswordSignIn,
  completeOtpSignIn,
  demoUsers,
  getOtpTimeRemaining,
  roleLabels,
} from '../auth.js'

const formatSecret = (secret = '') => secret.match(/.{1,4}/g) || []

function CopyButton({ label, copiedField, onCopy, value, children }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(label, value)}
      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition-colors duration-200 hover:border-amber-300 hover:text-pnb-crimson"
    >
      <Copy size={12} />
      {copiedField === label ? 'Copied' : children}
    </button>
  )
}

function StatusBanner({ error, statusMessage }) {
  if (!error && !statusMessage) {
    return null
  }

  return (
    <p className={`rounded-xl border px-4 py-3 text-sm leading-6 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {error || statusMessage}
    </p>
  )
}

function HeroPanel() {
  return (
    <div className="relative hidden flex-col justify-center px-12 lg:flex lg:w-[52%] xl:px-16">
      {[...Array(8)].map((_, index) => (
        <div
          key={index}
          className="absolute h-1 w-1 rounded-full bg-amber-400 opacity-30"
          style={{
            left: `${12 + index * 10}%`,
            top: `${16 + (index % 4) * 18}%`,
            animation: `pulse-red ${1.8 + index * 0.25}s ease-in-out infinite`,
          }}
        />
      ))}
      <div className="mb-10 flex items-center gap-4 opacity-80">
        {['PSB', 'IIT', 'RBI', 'DSCI'].map((name) => (
          <div
            key={name}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 font-display text-xs font-bold text-white"
          >
            {name}
          </div>
        ))}
      </div>

      <p className="mb-2 font-display text-lg font-semibold uppercase tracking-widest text-amber-300">
        Enterprise Security Portal
      </p>
      <h1 className="font-display text-5xl font-extrabold leading-tight text-amber-400 xl:text-6xl">
        Asset & Risk
      </h1>
      <h1 className="mb-6 font-display text-5xl font-extrabold leading-tight text-amber-400 xl:text-6xl">
        Intelligence
      </h1>
      <p className="font-display text-xl tracking-[0.35em] text-white">
        Quantum-Ready Infrastructure
      </p>

      <p className="mt-8 max-w-xl text-base leading-8 text-amber-50/90">
        Gain actionable insights into cryptographic risks, asset intelligence, and post-quantum readiness across your enterprise ecosystem. 
      </p>

      <div className="mt-10 opacity-30">
        <PNBShield size={180} />
      </div>

      <p className="mt-4 font-display text-xs uppercase tracking-widest text-amber-300/60">
        Authorised Personnel Only
      </p>
    </div>
  )
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@pnb.com')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [authStep, setAuthStep] = useState('password')
  const [otpSetup, setOtpSetup] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [secondsRemaining, setSecondsRemaining] = useState(() => getOtpTimeRemaining())
  const [copiedField, setCopiedField] = useState('')
  const [transitionStage, setTransitionStage] = useState('idle')
  const otpInputRef = useRef(null)

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsRemaining(getOtpTimeRemaining()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!copiedField) {
      return undefined
    }

    const timer = window.setTimeout(() => setCopiedField(''), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedField])

  const isOtpStep = authStep === 'otp'
  const isTransitioning = transitionStage !== 'idle'
  const selectedRole = selectedUser ? roleLabels[selectedUser.role] : ''
  const otpSecretGroups = formatSecret(otpSetup?.secret)

  const handleSelectDemoUser = (user) => {
    setEmail(user.email)
    setPassword(user.password)
    setOtp('')
    setAuthStep('password')
    setOtpSetup(null)
    setSelectedUser(null)
    setTransitionStage('idle')
    setCopiedField('')
    setStatusMessage('Credentials pre-filled. Please continue.')
    setError('')
  }

  const copyValue = async (label, value) => {
    try {
      await window.navigator.clipboard.writeText(value)
      setCopiedField(label)
      setError('')
    } catch {
      setError(`Unable to copy the ${label.toLowerCase()} automatically.`)
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setStatusMessage('')

    try {
      const result = await beginPasswordSignIn({ identifier: email, password })
      if (!result.success) {
        setError(result.message)
        return
      }

      setAuthStep('otp')
      setOtp('')
      setOtpSetup(result.otpSetup)
      setSelectedUser(result.user)
    } catch {
      setError('Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setStatusMessage('')

    try {
      const result = await completeOtpSignIn({ identifier: email, password, otp })
      if (!result.success) {
        setError(result.message)
        return
      }

      setTransitionStage('success')
      setStatusMessage('Authentication complete.')
      window.setTimeout(() => setTransitionStage('entering'), 120)
      window.setTimeout(() => onLogin(result.user), 950)
    } catch {
      setError('OTP verification failed. Please try again.')
      setTransitionStage('idle')
    } finally {
      setLoading(false)
    }
  }

  const resetOtpFlow = () => {
    setAuthStep('password')
    setOtp('')
    setOtpSetup(null)
    setSelectedUser(null)
    setTransitionStage('idle')
    setCopiedField('')
    setStatusMessage('')
    setError('')
  }

  useEffect(() => {
    if (!isOtpStep) {
      return undefined
    }

    const frame = window.requestAnimationFrame(() => otpInputRef.current?.focus())
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !loading && !isTransitioning) {
        resetOtpFlow()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOtpStep, loading, isTransitioning])

  return (
    <div className={`login-bg relative min-h-screen w-full overflow-x-hidden overflow-y-auto transition-all duration-700 ${transitionStage === 'entering' ? 'login-success-wash' : ''}`}>
      <div className="scan-line" style={{ zIndex: 0 }} />
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#F59E0B 1px, transparent 1px), linear-gradient(90deg, #F59E0B 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {isTransitioning && (
        <div className={`absolute inset-0 z-40 flex items-center justify-center px-6 ${transitionStage === 'entering' ? 'login-success-overlay entering' : 'login-success-overlay'}`}>
          <div className="glass-card login-success-card w-full max-w-md rounded-[32px] border border-emerald-200/80 p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg">
              <CheckCircle2 size={38} />
            </div>
            <p className="mt-5 font-display text-[11px] uppercase tracking-[0.35em] text-emerald-700">Access Confirmed</p>
            <h3 className="mt-3 font-display text-3xl font-bold text-pnb-crimson">Initiating Session</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Securing connection to the operational dashboard...
            </p>
            <div className="mx-auto mt-6 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-emerald-100">
              <div className="login-progress-bar h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-pnb-crimson" />
            </div>
          </div>
        </div>
      )}

      {isOtpStep && otpSetup && !isTransitioning && (
        <div className="fixed inset-0 z-30 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="absolute inset-0 bg-pnb-darkred/60 backdrop-blur-md" />
          <div className="relative mx-auto flex min-h-full w-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="otp-modal-title"
              className="glass-card relative w-full max-w-5xl overflow-hidden rounded-[34px] border border-amber-200/70 bg-white/90 shadow-[0_30px_120px_rgba(26,0,0,0.5)]"
            >
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-pnb-crimson/10 via-pnb-gold/10 to-transparent" />

              <form
                onSubmit={handleOtpSubmit}
                className="relative max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain"
              >
                <div className="border-b border-amber-100/80 px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 id="otp-modal-title" className="font-display text-2xl font-bold text-pnb-crimson flex items-center gap-3">
                        <ShieldCheck className="text-pnb-amber" /> Two-Factor Authentication
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Scan the QR code with your authenticator app and enter the 6-digit code.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-2xl border border-amber-200 bg-white px-4 py-2 text-center shadow-sm">
                        <p className="font-display text-2xl font-bold text-pnb-crimson">{secondsRemaining}s</p>
                      </div>

                      <button
                        type="button"
                        onClick={resetOtpFlow}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-display font-semibold text-slate-700 transition-all hover:bg-slate-50"
                      >
                        <RefreshCw size={14} /> Back
                      </button>

                      <button
                        type="button"
                        onClick={resetOtpFlow}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {error && (
                    <div className="mt-4">
                      <StatusBanner error={error} statusMessage={statusMessage} />
                    </div>
                  )}
                </div>

                <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="border-b border-amber-100/80 bg-slate-50/50 p-6 lg:border-b-0 lg:border-r">
                    <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm text-center">
                       <p className="font-display text-[10px] uppercase tracking-widest text-slate-500 mb-1">Identity</p>
                       <h3 className="font-display text-xl font-bold text-pnb-crimson">{selectedUser?.name || 'Authorized User'}</h3>
                       <p className="text-sm text-slate-600">{selectedRole}</p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="rounded-xl border border-slate-100 p-2 shadow-inner">
                        <img
                          src={otpSetup.qrCodePath}
                          alt="Authenticator QR code"
                          className="mx-auto block w-full max-w-[200px]"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-4 text-center">
                        <CopyButton label="OTP Link" copiedField={copiedField} onCopy={copyValue} value={otpSetup.otpauthUrl || ''}>
                          Copy Setup Link
                        </CopyButton>
                    </div>
                  </div>

                  <div className="p-6 lg:px-10 lg:py-8 space-y-8 flex flex-col justify-center">
                    
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Manual Setup Key</p>
                        <CopyButton label="Manual Key" copiedField={copiedField} onCopy={copyValue} value={otpSetup.secret || ''}>
                          Copy
                        </CopyButton>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {otpSecretGroups.map((group, index) => (
                          <div
                            key={`${group}-${index}`}
                            className="rounded-lg bg-slate-200/50 px-2 py-2 text-center font-mono text-sm tracking-widest text-slate-700"
                          >
                            {group}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block font-display text-sm font-semibold text-slate-700">
                        Security Code
                      </label>
                      <div className="relative">
                        <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-pnb-amber" />
                        <input
                          ref={otpInputRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={otp}
                          onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000 000"
                          className="w-full rounded-2xl border border-amber-200 bg-white py-4 pl-12 pr-4 text-2xl tracking-[0.3em] font-mono text-pnb-crimson focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || isTransitioning || otp.length < 6}
                      className="w-full rounded-2xl bg-pnb-crimson py-4 text-sm font-display font-semibold tracking-wide text-white transition-all hover:bg-pnb-darkred disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Cpu size={14} className="animate-spin" /> Verifying...
                        </span>
                      ) : 'Secure Login'}
                    </button>
                    
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col lg:flex-row transition-all duration-700 ${
          isTransitioning
            ? 'scale-[0.985] opacity-20 blur-[3px]'
            : isOtpStep
              ? 'scale-[0.985] opacity-35 blur-[10px] pointer-events-none select-none'
              : 'opacity-100'
        }`}
      >
        <div className="relative flex w-full items-center justify-center px-4 py-10 sm:px-6 lg:min-h-screen lg:w-[48%] lg:px-10 lg:py-12 xl:px-14">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {[...Array(8)].map((_, index) => (
              <div
                key={index}
                className="absolute h-1 w-1 rounded-full bg-amber-400 opacity-30"
                style={{
                  left: `${10 + index * 12}%`,
                  top: `${20 + (index % 3) * 25}%`,
                  animation: `pulse-red ${1.5 + index * 0.3}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>

          <div className="glass-card relative w-full max-w-lg rounded-[32px] border border-amber-200/60 p-6 shadow-2xl sm:p-10">
            <div className="mb-8 flex items-center gap-4">
              <div className="rounded-2xl border border-amber-200/70 bg-white p-3 shadow-sm">
                <PNBShield size={48} />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-3xl font-bold text-pnb-crimson">Sign In</h2>
                <p className="text-sm text-slate-600">to QRIE Platform</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wider text-slate-500">Email Address / User ID</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-pnb-amber" />
                    <input
                      type="text"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@pnb.com"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-10 pr-4 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-pnb-amber" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-10 pr-10 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((currentValue) => !currentValue)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {!isOtpStep && <StatusBanner error={error} statusMessage={statusMessage} />}

              <button
                type="submit"
                disabled={loading || isTransitioning}
                className="w-full rounded-2xl bg-gradient-to-r from-pnb-crimson to-pnb-darkred py-4 text-sm font-display font-semibold tracking-wide text-white transition-all duration-300 hover:shadow-lg disabled:opacity-70 mt-4"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Cpu size={16} className="animate-spin" />
                    Authenticating...
                  </span>
                ) : 'Log In'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="mb-4 font-display text-[10px] uppercase tracking-widest text-slate-400 text-center">Development Account Access</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {demoUsers.map((user) => {
                  const isSelected = email.toLowerCase() === user.email.toLowerCase()
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => handleSelectDemoUser(user)}
                      className={`block rounded-xl border px-3 py-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-amber-300 bg-amber-50/50'
                          : 'border-slate-100 bg-white hover:border-amber-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-display text-xs font-bold text-slate-700">{roleLabels[user.role]}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{user.username}</span>
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        </div>

        <HeroPanel />
      </div>
    </div>
  )
}
