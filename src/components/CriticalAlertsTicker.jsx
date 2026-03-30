import React from 'react'

const alerts = [
  "CRITICAL: Unauthorized access attempt detected on Node 10.4.52.1",
  "WARNING: CBOM mismatch in Application ID: PNB_CORP_012",
  "ALERT: SSL Certificate for secure.pnb.com expiring in 3 days",
  "SYSTEM: Potential Quantum Attack Pattern identified on Gateway-04",
  "SECURITY: Data encryption standard (AES-128) below recommended PQC level"
]

export default function CriticalAlertsTicker() {
  return (
    <div className="bg-red-600 text-white py-1 overflow-hidden relative border-y border-red-700 shadow-sm">
      <div className="flex whitespace-nowrap animate-ticker w-max">
        {/* Triple the alerts for a very long seamless ribbon */}
        {[...alerts, ...alerts, ...alerts].map((alert, idx) => (
          <span key={idx} className="mx-12 font-display text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-3 text-white/90">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            {alert}
          </span>
        ))}
      </div>
      
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(-33.33%); }
          100% { transform: translateX(0%); }
        }
        .animate-ticker {
          animation: ticker 60s linear infinite;
        }
      `}</style>
    </div>
  )
}
