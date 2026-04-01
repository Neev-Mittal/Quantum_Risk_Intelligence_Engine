import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Login from './pages/Login.jsx'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import AssetInventory from './pages/AssetInventory.jsx'
import AssetDiscovery from './pages/AssetDiscovery.jsx'
import CBOM from './pages/CBOM.jsx'
import PostureOfPQC from './pages/PostureOfPQC.jsx'
import CyberRating from './pages/CyberRating.jsx'
import Reporting from './pages/Reporting.jsx'
import BusinessImpact from './pages/BusinessImpact.jsx'
import ScannerEngine from './pages/ScannerEngine.jsx'
import {
  clearStoredSession,
  getFirstAuthorizedRoute,
  getStoredSession,
  userHasAccess,
} from './auth.js'

function ProtectedRoute({ user, allowedPaths }) {
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!allowedPaths.some((path) => userHasAccess(user, path))) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}

function UnauthorizedPage({ user }) {
  const navigate = useNavigate()
  const fallbackRoute = user ? getFirstAuthorizedRoute(user) : '/login'

  return (
    <div className="min-h-screen login-bg flex items-center justify-center px-6">
      <div className="glass-card w-full max-w-xl rounded-2xl border border-amber-200/50 p-8 text-center shadow-2xl">
        <p className="font-display text-xs uppercase tracking-[0.35em] text-pnb-amber mb-3">
          Access Restricted
        </p>
        <h1 className="font-display text-3xl font-bold text-pnb-crimson mb-3">
          You are authenticated, but not authorised for this module.
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Your current role does not include permission for the page you requested.
        </p>
        <button
          type="button"
          onClick={() => navigate(fallbackRoute, { replace: true })}
          className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-pnb-gold to-pnb-amber px-5 py-3 text-sm font-display font-semibold tracking-wide text-white shadow-lg"
        >
          Go to an authorised page
        </button>
      </div>
    </div>
  )
}

function LoginRedirect({ user }) {
  const location = useLocation()
  const requestedPath = location.state?.from
  const targetPath = requestedPath && userHasAccess(user, requestedPath)
    ? requestedPath
    : getFirstAuthorizedRoute(user)

  return <Navigate to={targetPath} replace />
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getStoredSession())

  const handleLogin = (user) => {
    setCurrentUser(user)
  }

  const handleLogout = () => {
    clearStoredSession()
    setCurrentUser(null)
  }

  const sharedRoutes = useMemo(
    () => ['/', '/asset-inventory', '/posture-pqc', '/cyber-rating', '/reporting'],
    []
  )
  const checkerRoutes = useMemo(() => ['/cbom'], [])
  const auditorRoutes = useMemo(() => ['/business-impact'], [])
  const itOpsRoutes = useMemo(() => ['/asset-discovery', '/scanner'], [])

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            currentUser
              ? <LoginRedirect user={currentUser} />
              : <Login onLogin={handleLogin} />
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage user={currentUser} />} />

        <Route element={<ProtectedRoute user={currentUser} allowedPaths={sharedRoutes} />}>
          <Route element={<Layout currentUser={currentUser} onLogout={handleLogout} />}>
            <Route path="/" element={<Home />} />
            <Route path="/asset-inventory" element={<AssetInventory />} />
            <Route path="/posture-pqc" element={<PostureOfPQC />} />
            <Route path="/cyber-rating" element={<CyberRating />} />
            <Route path="/reporting" element={<Reporting />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute user={currentUser} allowedPaths={checkerRoutes} />}>
          <Route element={<Layout currentUser={currentUser} onLogout={handleLogout} />}>
            <Route path="/cbom" element={<CBOM />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute user={currentUser} allowedPaths={auditorRoutes} />}>
          <Route element={<Layout currentUser={currentUser} onLogout={handleLogout} />}>
            <Route path="/business-impact" element={<BusinessImpact />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute user={currentUser} allowedPaths={itOpsRoutes} />}>
          <Route element={<Layout currentUser={currentUser} onLogout={handleLogout} />}>
            <Route path="/asset-discovery" element={<AssetDiscovery />} />
            <Route path="/scanner" element={<ScannerEngine />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={<Navigate to={currentUser ? getFirstAuthorizedRoute(currentUser) : '/login'} replace />}
        />
      </Routes>
    </ErrorBoundary>
  )
}
