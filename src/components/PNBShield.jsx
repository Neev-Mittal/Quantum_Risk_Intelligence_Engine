export default function PNBShield({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
      {/* Shield */}
      <defs>
        <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="innerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#7C0000" />
        </linearGradient>
      </defs>
      <path
        d="M50 5 L90 22 L90 55 Q90 85 50 105 Q10 85 10 55 L10 22 Z"
        fill="url(#shieldGrad)"
        stroke="#92400E"
        strokeWidth="2"
      />
      <path
        d="M50 14 L82 28 L82 55 Q82 78 50 96 Q18 78 18 55 L18 28 Z"
        fill="url(#innerGrad)"
      />
      {/* PNB text */}
      <text x="50" y="58" textAnchor="middle" fill="#FCD34D"
        fontFamily="Oxanium,sans-serif" fontWeight="800" fontSize="20">
        pnb
      </text>
      {/* PQC-Ready arc hint */}
      <path
        d="M28 30 Q50 20 72 30"
        fill="none"
        stroke="#FCD34D"
        strokeWidth="1.5"
        strokeDasharray="3 2"
        opacity="0.7"
      />
      {/* orbit ring */}
      <ellipse cx="50" cy="60" rx="36" ry="10" fill="none"
        stroke="#FCD34D" strokeWidth="1" opacity="0.4"
        transform="rotate(-20 50 60)" />
    </svg>
  )
}
