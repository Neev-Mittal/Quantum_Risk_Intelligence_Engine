import { NavLink } from 'react-router-dom'
import {
  Home, Star, Search, FileText, Shield, Award, BarChart2,
  Zap, Radar
} from 'lucide-react'

const navItems = [
  { to: '/',                 label: 'Home',             Icon: Home      },
  { to: '/asset-inventory',  label: 'Asset Inventory',  Icon: Star      },
  { to: '/asset-discovery',  label: 'Asset Discovery',  Icon: Search    },
  { to: '/cbom',             label: 'CBOM',             Icon: FileText  },
  { to: '/posture-pqc',      label: 'Posture of PQC',   Icon: Shield    },
  { to: '/cyber-rating',     label: 'Cyber Rating',     Icon: Award     },
  { to: '/reporting',        label: 'Reporting',        Icon: BarChart2 },
  { to: '/business-impact',  label: 'Business Impact',  Icon: Zap,  divider: true },
  { to: '/scanner',          label: 'Scanner Engine',   Icon: Radar },
]

export default function Sidebar() {
  return (
    <aside className="sidebar-bg w-64 flex-shrink-0 flex flex-col h-full shadow-2xl">
      {/* Branding strip */}
      <div className="px-4 py-5 border-b border-red-900/40">
        <p className="font-display text-xs text-amber-300 tracking-widest uppercase opacity-80">
          PSB Hackathon 2026
        </p>
        <p className="font-display text-sm text-white font-semibold mt-0.5">
          Quantum Risk Intelligence Engine
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(({ to, label, Icon, divider }) => (
          <div key={to}>
            {divider && (
              <div className="mx-4 my-2 border-t border-red-900/40" />
            )}
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-link flex items-center gap-3 px-5 py-3 text-sm font-body cursor-pointer
                 ${isActive ? 'nav-active font-semibold' : 'text-red-100 hover:text-white'}`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-red-900/40">
        <p className="text-xs text-red-300 opacity-60 font-display">
          TechEncode · Vishwakarma Univ
        </p>
        <p className="text-xs text-amber-400 opacity-70 mt-0.5 font-display">
          v1.0
        </p>
      </div>
    </aside>
  )
}
