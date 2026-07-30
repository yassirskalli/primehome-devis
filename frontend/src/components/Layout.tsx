import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, Users, LogOut, ArrowLeft } from 'lucide-react'
import { clearAuth, getUser } from '../lib/auth'
import clsx from 'clsx'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/devis', icon: FileText, label: 'Devis' },
  { to: '/clients', icon: Users, label: 'Clients' },
]

export function Layout() {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    clearAuth()
    window.location.href = '/'
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-900 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-800 flex items-center justify-center">
          <img
            src="/primehome-logo.jpg"
            alt="Prime Home"
            className="h-16 w-auto object-contain"
          />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-red-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <div className="text-xs text-gray-400 mb-3 px-3">{user}</div>
          <a href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors mb-1">
            <ArrowLeft className="w-4 h-4" />
            Portail
          </a>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors">
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
