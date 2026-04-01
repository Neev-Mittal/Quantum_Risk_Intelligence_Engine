import { useEffect, useRef, useState } from 'react'
import PNBShield from '../components/PNBShield.jsx'
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Cpu,
  ShieldCheck,
  KeyRound,
  Copy,
  RefreshCw,
  CheckCircle2,
  QrCode,
  X,
} from 'lucide-react'
import {
  beginPasswordSignIn,
  completeOtpSignIn,
  demoUsers,
  getOtpTimeRemaining,
  roleLabels,
} from '../auth.js'

const stepCardClass = (active, complete) => {
  if (complete) {
    return 'border-emerald-300 bg-emerald-50/90 text-emerald-900 shadow-sm'
  }

  if (active) {
    return 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-100 text-pnb-crimson shadow-sm'
  }

  return 'border-slate-200 bg-white/70 text-slate-500'
}

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
    <p className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {error || statusMessage}
    </p>
  )
}

function StepCard({ number, label, title, description, active, complete }) {
  return (
    <div className={`rounded-2xl border p-4 transition-all duration-300 ${stepCardClass(active, complete)}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-current/15 bg-white/70 font-display text-sm font-bold">
          {number}
        </div>
        <div>
          <p className="font-display text-xs uppercase tracking-[0.28em]">{label}</p>
          <h3 className="mt-1 font-display text-lg font-bold">{title}</h3>
          <p className="mt-1 text-sm leading-6 opacity-80">{description}</p>
        </div>
      </div>
    </div>
  )
}

function OtpInstruction({ step, children }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white/90 px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-display text-xs font-bold text-pnb-crimson">
          {step}
        </span>
        <p className="text-sm leading-6 text-slate-700">{children}</p>
      </div>
    </div>
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
        PSB Hackathon Series
      </p>
      <h1 className="font-display text-5xl font-extrabold leading-tight text-amber-400 xl:text-6xl">
        PSB Cybersecurity
      </h1>
      <h1 className="mb-6 font-display text-5xl font-extrabold leading-tight text-amber-400 xl:text-6xl">
        Hackathon 2026
      </h1>
      <p className="font-display text-xl tracking-[0.35em] text-white">
        Cyber Innovation Begins
      </p>

      <p className="mt-8 max-w-xl text-base leading-8 text-amber-50/90">
        Explore cryptographic risk, asset intelligence, compliance readiness, and post-quantum posture through a role-aware operational dashboard built for a banking security context with stronger multifactor access.
      </p>

      <div className="mt-10 opacity-30">
        <PNBShield size={180} />
      </div>

      <p className="mt-4 font-display text-xs uppercase tracking-widest text-amber-300/60">
        In collaboration with IIT Kanpur
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
  const passwordStepComplete = isOtpStep || isTransitioning

  const handleSelectDemoUser = (user) => {
    setEmail(user.email)
    setPassword(user.password)
    setOtp('')
    setAuthStep('password')
    setOtpSetup(null)
    setSelectedUser(null)
    setTransitionStage('idle')
    setCopiedField('')
    setStatusMessage('Demo credentials loaded. Continue to OTP verification when you are ready.')
    setError('')
  }

  const copyValue = async (label, value) => {
    try {
      await window.navigator.clipboard.writeText(value)
      setCopiedField(label)
      setError('')
    } catch {
      setError(`Unable to copy the ${label.toLowerCase()} automatically. You can still copy it manually.`)
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
      setStatusMessage(result.message)
    } catch {
      setError('Password verification failed unexpectedly. Please try again.')
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
      setStatusMessage('Authentication complete. Preparing your secure workspace...')
      window.setTimeout(() => setTransitionStage('entering'), 120)
      window.setTimeout(() => onLogin(result.user), 950)
    } catch {
      setError('OTP verification failed unexpectedly. Please try again.')
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
    setStatusMessage('Password step reset. Re-verify the selected account to request a fresh OTP.')
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
            <h3 className="mt-3 font-display text-3xl font-bold text-pnb-crimson">Welcome to QRIE</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Identity, password, and OTP checks completed. We are easing you into the operational dashboard now.
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
              className="glass-card relative w-full max-w-6xl overflow-hidden rounded-[34px] border border-amber-200/70 bg-white/90 shadow-[0_30px_120px_rgba(26,0,0,0.5)]"
            >
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-pnb-crimson/10 via-pnb-gold/10 to-transparent" />

              <form
                onSubmit={handleOtpSubmit}
                className="relative max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain"
              >
                <div className="border-b border-amber-100/80 px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-[11px] uppercase tracking-[0.35em] text-pnb-amber">Secure OTP Window</p>
                      <h2 id="otp-modal-title" className="mt-2 font-display text-3xl font-bold text-pnb-crimson">
                        Continue OTP Verification
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                        The enrollment details now open in a dedicated window so the QR code, setup instructions, and live OTP entry stay cleanly structured without squeezing into the login page layout.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Code Refresh</p>
                        <p className="font-display text-3xl font-bold text-pnb-crimson">{secondsRemaining}s</p>
                      </div>

                      <button
                        type="button"
                        onClick={resetOtpFlow}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm font-display font-semibold tracking-wide text-slate-700 transition-all duration-300 hover:bg-slate-50"
                      >
                        <RefreshCw size={14} />
                        Change Account
                      </button>

                      <button
                        type="button"
                        onClick={resetOtpFlow}
                        aria-label="Close OTP verification window"
                        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700 transition-colors duration-300 hover:bg-slate-50"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    <StatusBanner error={error} statusMessage={statusMessage} />
                  </div>
                </div>

                <div className="grid xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-5 border-b border-amber-100/80 bg-gradient-to-b from-amber-50/70 via-white to-white p-5 sm:p-6 xl:border-b-0 xl:border-r xl:border-amber-100/80 lg:p-7">
                    <div className="rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50/95 via-white to-amber-100/80 p-5 shadow-sm">
                      <p className="font-display text-[11px] uppercase tracking-[0.3em] text-pnb-crimson">Verified Identity</p>
                      <h3 className="mt-3 font-display text-2xl font-bold text-pnb-crimson">
                        {selectedUser?.name || 'Selected demo account'}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedRole}</p>
                      <p className="mt-1 break-words text-sm text-slate-500">{selectedUser?.email}</p>
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4">
                        <p className="font-display text-[11px] uppercase tracking-[0.28em] text-emerald-700">Session Status</p>
                        <p className="mt-2 text-sm leading-6 text-emerald-900">
                          Password verification has completed. Finish the second factor here to enter the QRIE workspace.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-amber-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-pnb-crimson">
                        <QrCode size={18} />
                        <p className="font-display text-[11px] uppercase tracking-[0.3em]">QR Enrollment</p>
                      </div>
                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-inner">
                        <img
                          src={otpSetup.qrCodePath}
                          alt={`Authenticator QR code for ${otpSetup.accountName}`}
                          className="mx-auto block w-full max-w-[250px]"
                        />
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        Open your authenticator app, choose add account, and scan the code while keeping the full white border visible.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Enrollment Link</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        For apps that support direct URI import, copy the OTP setup link from here.
                      </p>
                      <div className="mt-4">
                        <CopyButton label="OTP URI" copiedField={copiedField} onCopy={copyValue} value={otpSetup.otpauthUrl || ''}>
                          Copy OTP URI
                        </CopyButton>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-6 p-5 sm:p-6 lg:p-7">
                    <div className="rounded-[28px] border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-amber-50/70 p-5 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-pnb-crimson">Quick Setup Flow</p>
                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <OtpInstruction step="1">
                          Add a new time-based OTP account in your authenticator app such as Google Authenticator, Microsoft Authenticator, 2FAS, or Aegis.
                        </OtpInstruction>
                        <OtpInstruction step="2">
                          Scan the QR code first. If scanning is blocked, enter the grouped Base32 key manually using the exact secret below.
                        </OtpInstruction>
                        <OtpInstruction step="3">
                          Type the live 6-digit OTP into the verification field before the countdown resets and submit to enter QRIE securely.
                        </OtpInstruction>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Issuer</p>
                        <p className="mt-2 break-words text-sm font-semibold text-slate-700">{otpSetup.issuer}</p>
                        <div className="mt-3">
                          <CopyButton label="Issuer" copiedField={copiedField} onCopy={copyValue} value={otpSetup.issuer || ''}>
                            Copy
                          </CopyButton>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Account</p>
                        <p className="mt-2 break-words text-sm font-semibold text-slate-700">{otpSetup.accountName}</p>
                        <div className="mt-3">
                          <CopyButton label="Account" copiedField={copiedField} onCopy={copyValue} value={otpSetup.accountName || ''}>
                            Copy
                          </CopyButton>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-5 shadow-sm sm:px-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Manual Key</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            Readable grouped Base32 secret for manual authenticator enrollment.
                          </p>
                        </div>
                        <CopyButton label="Manual Key" copiedField={copiedField} onCopy={copyValue} value={otpSetup.secret || ''}>
                          Copy Key
                        </CopyButton>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-[24px] bg-slate-950 px-4 py-4 shadow-inner">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {otpSecretGroups.map((group, index) => (
                            <div
                              key={`${group}-${index}`}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center font-mono text-base font-semibold tracking-[0.18em] text-amber-100"
                            >
                              {group}
                            </div>
                          ))}
                        </div>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Enter the secret as one continuous key in your authenticator app. The grouped tiles are only for readability.
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-amber-200 bg-white p-5 shadow-sm">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                        <div className="min-w-0">
                          <label className="mb-1 block font-display text-xs font-semibold uppercase tracking-wider text-pnb-crimson">
                            6-Digit OTP
                          </label>
                          <div className="relative">
                            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pnb-amber" />
                            <input
                              ref={otpInputRef}
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              value={otp}
                              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="Enter the live OTP"
                              className="w-full rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white py-4 pl-10 pr-4 text-lg tracking-[0.22em] text-pnb-crimson placeholder:text-sm placeholder:tracking-normal placeholder-red-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                          </div>
                          <p className="mt-3 text-xs leading-6 text-slate-500">
                            The secure OTP window keeps this field readable on every screen size and prevents the setup content from spilling outside the page.
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={loading || isTransitioning}
                          className="w-full rounded-2xl border border-amber-300 bg-white py-4 text-sm font-display font-semibold tracking-wide text-pnb-crimson transition-all duration-300 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-70"
                        >
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <Cpu size={14} className="animate-spin" />
                              Verifying OTP...
                            </span>
                          ) : 'Enter QRIE Securely'}
                        </button>
                      </div>
                    </div>
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

          <div className="glass-card relative w-full max-w-2xl rounded-[32px] border border-amber-200/60 p-5 shadow-2xl sm:p-7 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto xl:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-[11px] uppercase tracking-[0.35em] text-pnb-amber">Secure Access</p>
                <h2 className="mt-2 font-display text-3xl font-bold text-pnb-crimson">Enter QRIE</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                  Password verification and free authenticator-based OTP keep the same banking security theme while making sign-in noticeably safer.
                </p>
              </div>
              <div className="hidden rounded-2xl border border-amber-200/70 bg-white/70 p-3 shadow-sm sm:block">
                <PNBShield size={56} />
              </div>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <StepCard
                number="01"
                label="Credentials"
                title="Verify Password"
                description="Choose a demo account and confirm the username plus passcode."
                active={!passwordStepComplete}
                complete={passwordStepComplete}
              />
              <StepCard
                number="02"
                label="Authenticator"
                title="Confirm Live OTP"
                description="Scan the QR code or paste the manual key into any free TOTP app."
                active={isOtpStep}
                complete={isTransitioning}
              />
            </div>

            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 font-display text-[11px] uppercase tracking-[0.3em] text-emerald-700">Free OTP Mode</p>
                  <h3 className="font-display text-lg font-bold text-emerald-900">Authenticator apps only</h3>
                  <p className="mt-1 text-sm text-emerald-800/80">
                    Google Authenticator, Microsoft Authenticator, 2FAS, Aegis, and similar apps work here with no SMS charges and no paid gateway integration.
                  </p>
                </div>
                <ShieldCheck size={20} className="mt-1 shrink-0 text-emerald-700" />
              </div>
            </div>

            <div className="mb-6 rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50/95 via-white to-amber-100/80 p-4 text-left shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-[11px] uppercase tracking-[0.3em] text-pnb-crimson">Approved Demo Accounts</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-pnb-crimson">Pick a banking role</h3>
                </div>
                <div className="hidden rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-500 sm:block">
                  Tap to preload
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {demoUsers.map((user) => {
                  const isSelected = email.toLowerCase() === user.email.toLowerCase()
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => handleSelectDemoUser(user)}
                      className={`block rounded-2xl border px-4 py-4 text-left transition-all duration-300 ${
                        isSelected
                          ? 'border-amber-400 bg-white shadow-md ring-2 ring-amber-200'
                          : 'border-amber-200 bg-white/80 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-white'
                      }`}
                    >
                      <span className="block font-display text-sm font-bold text-pnb-crimson">{roleLabels[user.role]}</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{user.username} / {user.password}</span>
                      <span className="mt-2 block text-[11px] text-slate-500">{user.email}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-display text-xs font-semibold uppercase tracking-wider text-pnb-crimson">Email / Username</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pnb-amber" />
                    <input
                      type="text"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@pnb.com"
                      className="w-full rounded-xl border border-amber-200 bg-amber-50 py-3 pl-9 pr-4 text-sm text-pnb-crimson placeholder-red-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-display text-xs font-semibold uppercase tracking-wider text-pnb-crimson">Passcode</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pnb-amber" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your passcode"
                      className="w-full rounded-xl border border-amber-200 bg-amber-50 py-3 pl-9 pr-10 text-sm text-pnb-crimson placeholder-red-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((currentValue) => !currentValue)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-pnb-amber"
                      aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {!isOtpStep && <StatusBanner error={error} statusMessage={statusMessage} />}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs leading-6 text-slate-600">
                  Step 1 validates the selected banking identity. Step 2 opens in a dedicated OTP window with a blurred background so the QR, key, and guidance stay clean and readable at practical screen sizes.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || isTransitioning}
                className="w-full rounded-2xl border border-amber-300 bg-white py-4 text-sm font-display font-semibold tracking-wide text-pnb-crimson transition-all duration-300 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-70"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Cpu size={14} className="animate-spin" />
                    Verifying Password...
                  </span>
                ) : 'Continue to OTP Verification'}
              </button>
            </form>
          </div>
        </div>

        <HeroPanel />
      </div>
    </div>
  )
}
