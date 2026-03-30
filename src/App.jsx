import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
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

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />
  }

  return (
    <ErrorBoundary>
      <Layout onLogout={() => setAuthenticated(false)}>
        <Routes>
          <Route path="/" index element={<Home />} />
          <Route path="/asset-inventory" element={<AssetInventory />} />
          <Route path="/asset-discovery" element={<AssetDiscovery />} />
          <Route path="/cbom" element={<CBOM />} />
          <Route path="/posture-pqc" element={<PostureOfPQC />} />
          <Route path="/cyber-rating" element={<CyberRating />} />
          <Route path="/reporting" element={<Reporting />} />
          <Route path="/business-impact" element={<BusinessImpact />} />
          <Route path="/scanner" element={<ScannerEngine />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}