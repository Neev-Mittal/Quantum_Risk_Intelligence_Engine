import React, { useState } from 'react'
import PNBShield from './PNBShield.jsx'
import { Bell, Star, LogOut, User, X } from 'lucide-react'

export default function Header({ onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })

  const profileData = {
    name: 'PNB Hackathon User',
    id: 'PNB_2026_007',
    email: 'hackathon@pnb.com',
    role: 'Security Architect',
    clearance: 'Quantum-Level',
    lastLogin: new Date().toLocaleString('en-IN')
  }

  return (
    <>
      <header className="h-20 bg-white/90 backdrop-blur-sm border-b border-amber-200 flex items-center justify-between px-6 shadow-sm flex-shrink-0 z-50 relative">
        {/* Date */}
        <span className="font-display text-sm text-pnb-crimson font-semibold tracking-wide">
          {dateStr}
        </span>

        {/* Centre — Logo + Title */}
        <div className="flex items-center gap-3">
          <PNBShield size={52} />
          <div className="text-center">
            <p className="font-display text-xs text-pnb-crimson tracking-widest uppercase opacity-70">
              PSB Hackathon 2026
            </p>
          </div>
        </div>

        {/* Right — User + alerts */}
        <div className="flex items-center gap-4">
          
          <div className="relative">
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 hover:bg-amber-100 transition-all shadow-sm"
            >
              <div className="w-7 h-7 rounded-full bg-pnb-crimson flex items-center justify-center">
                <Star size={12} className="text-amber-300" fill="currentColor" />
              </div>
              <span className="font-display text-sm text-pnb-crimson font-semibold">
                Welcome, hackathon_user..!
              </span>
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-amber-200 rounded-xl shadow-lg py-2 z-50">
                <button 
                  onClick={() => { setShowProfile(true); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-pnb-crimson hover:bg-amber-50 transition-colors"
                >
                  <User size={16} />
                  My Profile
                </button>
                <div className="border-t border-amber-100 my-1" />
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-semibold"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Profile Modal Overlay */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-200 animate-in fade-in zoom-in duration-200">
            <div className="bg-pnb-crimson px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-display font-bold uppercase tracking-widest">User Profile</h3>
              <button onClick={() => setShowProfile(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 rounded-full bg-amber-50 border-2 border-pnb-crimson flex items-center justify-center mb-3">
                  <Star size={40} className="text-pnb-crimson" fill="currentColor" />
                </div>
                <h4 className="text-xl font-display font-bold text-pnb-crimson">{profileData.name}</h4>
                <p className="text-sm text-amber-600 font-semibold">{profileData.role}</p>
              </div>

              <div className="space-y-4">
                {[
                  { label: 'Employee ID', value: profileData.id },
                  { label: 'Email Address', value: profileData.email },
                  { label: 'Security Clearance', value: profileData.clearance, high: true },
                  { label: 'Last Login', value: profileData.lastLogin }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between border-b border-amber-50 pb-2">
                    <span className="text-sm text-gray-500">{item.label}</span>
                    <span className={`text-sm font-semibold ${item.high ? 'text-red-600 uppercase' : 'text-pnb-crimson'}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowProfile(false)}
                className="w-full mt-8 bg-pnb-crimson text-white py-3 rounded-lg font-display font-bold uppercase tracking-widest hover:bg-red-700 transition-colors shadow-md"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
