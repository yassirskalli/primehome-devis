import { Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { DevisListPage } from './pages/DevisList'
import { DevisEditorPage } from './pages/DevisEditor'
import { ClientsPage } from './pages/Clients'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="devis" element={<DevisListPage />} />
        <Route path="devis/new" element={<DevisEditorPage />} />
        <Route path="devis/:id" element={<DevisEditorPage />} />
        <Route path="clients" element={<ClientsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
