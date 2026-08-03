import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, Users, LogOut, ArrowLeft, ClipboardList } from 'lucide-react'
import { clearAuth, getUser, hasRole } from '../lib/auth'
import clsx from 'clsx'

const BASE_NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/devis', icon: FileText, label: 'Devis' },
  { to: '/clients', icon: Users, label: 'Clients' },
]

export function Layout() {
  const navigate = useNavigate()
  const user = getUser()
  const canSeeOdooDevis = hasRole('admin') || hasRole('commercial')
  const NAV = [
    ...BASE_NAV,
    ...(canSeeOdooDevis ? [{ to: '/odoo-devis', icon: ClipboardList, label: 'Devis Odoo', end: false }] : []),
  ]

  function handleLogout() {
    clearAuth()
    window.location.href = '/'
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top navbar */}
      <header className="bg-gray-900 text-white shrink-0 flex items-center gap-2 px-4 h-12">
        <img src="/primehome-logo.jpg" alt="Prime Home" className="h-8 w-auto object-contain mr-2" />

        <nav className="flex items-center gap-0.5 flex-1">
          {NAV.map(({ to, icon: Icon, label, end = false }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-red-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 ml-auto shrink-0">
          <span className="text-xs text-gray-400 truncate max-w-32">{user}</span>
          <a href="/" className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Portail
          </a>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
