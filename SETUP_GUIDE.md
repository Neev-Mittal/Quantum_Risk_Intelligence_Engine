# PSB Cybersecurity Hackathon - QRIE Platform
## Complete Deployment & Setup Guide

### ✅ Recent Improvements

1. **Changed All Branding**: PSB Hackathon 2026 (not PNB)
2. **Created API Layer** (`src/api.js` & `src/dataAPI.js`)
3. **Real Data Integration**: Loads from Scanner/Risk/Simulation engines
4. **Error Boundaries**: Graceful error handling across app
5. **Loading States**: Visual feedback during data loading
6. **Data Loading Components**: Reusable `<LoadingSpinner />`, `<ErrorAlert />`, etc.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (`node -v`)
- npm 9+ (`npm -v`)
- Python 3.9+ (`python --version`)

### 1️⃣ Install Dependencies

```bash
# Navigate to project
cd qrie-frontend_backend

# Frontend
npm install

# Backend (already done, but ensure all packages)
pip install -r requirements.txt
```

### 2️⃣ Configure Environment

The `.env.local` file is already created with:
```
VITE_API_BASE_URL=http://localhost:8000
```

### 3️⃣ Start Development Servers

**Terminal 1 — Backend (Ports 8000 & 8001):**
```bash
python scanner_api.py
```
(In another terminal, run the data API:)
```bash
python data_api.py
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

### 4️⃣ Demo Credentials
- **Email**: Any email
- **Password**: Any non-empty password

---

## 📁 Project Structure

```
qrie-frontend_backend/
├── .env.local                    ← API configuration (auto-created)
├── public/data/                  ← Real data files from engines
│   ├── pnb/cbom.json
│   ├── pnb/subdomains.json
│   ├── risk/shadow-crypto.json
│   ├── risk/enriched_cbom.json
│   └── simulation.json
├── src/
│   ├── api.js                    ← API wrapper (for backend endpoints)
│   ├── dataAPI.js                ← Real data loader (JSON files)
│   ├── App.jsx                   ← Main app with ErrorBoundary
│   ├── components/
│   │   ├── ErrorBoundary.jsx     ← Error handling
│   │   ├── DataLoaders.jsx       ← Loading/Error components
│   │   ├── Header.jsx            ← Top bar
│   │   ├── Layout.jsx            ← Page wrapper
│   │   └── Sidebar.jsx           ← Navigation
│   ├── pages/
│   │   ├── Home.jsx              ← Dashboard (API integrated)
│   │   ├── AssetInventory.jsx    ← Table with real data (updated)
│   │   ├── AssetDiscovery.jsx    ← Subdomain discovery
│   │   ├── CBOM.jsx              ← Cryptography & algorithms
│   │   ├── PostureOfPQC.jsx      ← PQC readiness
│   │   ├── CyberRating.jsx       ← Risk tier ratings
│   │   ├── Reporting.jsx         ← Report generation
│   │   ├── BusinessImpact.jsx    ← QVaR simulation
│   │   └── ScannerEngine.jsx     ← Live TLS scanning
│   └── index.css                 ← Global styles (Tailwind)
├── package.json                  ← Frontend dependencies
├── requirements.txt              ← Backend dependencies
├── vite.config.js                ← Vite config (API proxy)
├── tailwind.config.js            ← Tailwind colors & fonts
├── data_api.py                   ← Data API server (new)
└── scanner_api.py                ← TLS scanner API
```

---

## 🔌 API Endpoints

### Data Endpoints (via `dataAPI.js`)

The `dataAPI.js` loads data from JSON files in `public/data/`:

| Endpoint | Source | Purpose |
|----------|--------|---------|
| `/data/pnb/cbom.json` | Scanner Engine | Asset inventory & TLS details |
| `/data/pnb/subdomains.json` | Scanner Engine | Discovered subdomains |
| `/data/risk/shadow-crypto.json` | Risk Engine | Crypto vulnerabilities |
| `/data/risk/enriched_cbom.json` | Risk Engine | HEI scores & risk ratings |
| `/data/simulation.json` | Simulation Engine | QVaR & business impact |

### Python Backend Endpoints

**Scanner API** (port 8000, in `scanner_api.py`):
- `GET /api/health` — Health check
- `POST /api/scan/stream` — SSE real-time scanning

**Data API** (port 8001, in `data_api.py`):
- `GET /api/health` — Health check
- `GET /api/assets?limit=100` — Asset inventory
- `GET /api/subdomains?limit=100` — Subdomains
- `GET /api/shadow-crypto` — Crypto findings
- `GET /api/pqc-posture` — PQC readiness
- `GET /api/cyber-rating` — Risk ratings
- `GET /api/business-impact` — QVaR data

---

## 🎨 UI/Color Updates

All hardcoded hex colors replaced with Tailwind classes:
- ✅ `#8B0000` → `bg-pnb-crimson`, `text-pnb-crimson`
- ✅ `#F59E0B` → `bg-pnb-gold`, `text-pnb-amber`
- ✅ `#D97706` → Uses Tailwind amber/orange
- ✅ All color system defined in `tailwind.config.js`

---

## 📊 Pages & Data Flow

### ✅ Home (Dashboard)
- Loads real assets & findings from `dataAPI`
- Displays stat cards with live counts
- Shows TLS distribution & key length charts
- Lists recent security findings

### ✅ Asset Inventory
- Table of all discovered assets
- Real-time search & filtering
- Risk categorization
- Certificate status tracking
- **Status**: Updated with `dataAPI` integration ✓

### 📋 Asset Discovery
- 4-tab interface: Domains, SSL, IPs, Software
- Displays subdomains from scanner output
- Tab-based discovery tracking

### 🔐 CBOM
- Cryptographic Bill of Materials
- Cipher suite usage
- Key length distribution
- Certificate authorities
- Weak crypto highlighting

### 🛡️ Posture of PQC
- Post-Quantum Cryptography readiness
- PQC-ready vs. legacy systems
- Compliance dashboard

### ⭐ Cyber Rating
- Tier-based rating system (Elite/Standard/Legacy/Critical)
- Enterprise security score (0-1000)
- Interactive tier definitions

### 📊 Business Impact
- QVaR simulation results
- CRQC exposure scenarios
- Blast radius visualization
- Financial risk assessment

### 📻 Scanner Engine
- Live TLS probing interface
- Real-time streaming results
- Manual target scanning
- Certificate extraction

### 📄 Reporting
- Executive reports
- Scheduled report generation
- On-demand report creation

---

## 🔧 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                    │
├─────────────────────────────────────────────────────────────┤
│ LocalHost:5173                                              │
│ ├─ pages/*                 (Dashboard, inventory,etc)       │
│ ├─ api.js                  (API wrapper)                    │
│ ├─ dataAPI.js              (JSON data loader)               │
│ └─ components/*            (UI components)                  │
└────────────────┬──────────────────────────────────────────┘
                 │ (HTTP Requests)
                 │
     ┌───────────┴──────────────┬──────────────┐
     │                          │              │
┌────▼──────────┐  ┌───────────▼───────┐  ┌───▼─────────┐
│  Vite Dev     │  │ Python API (8000) │  │ Data API    │
│  Proxy (:5173)│  │ scanner_api.py    │  │ (8001)      │
│               │  │                   │  │ data_api.py │
│ Routes:       │  │ TLS Scanning      │  │             │
│ /api/* → 8000 │  │ Real scans        │  │ JSON files  │
└───────────────┘  └───────────────────┘  └─────────────┘
                         │
                    ┌────▼───────┐
                    │  Real      │
                    │  Servers   │
                    │  (TLS/443) │
                    └────────────┘
```

---

## 🧪 Testing the App

1. **Login**: Enter any email and password
2. **Dashboard**: See live statistics and charts
3. **Asset Inventory**: Browse discovered assets (real data)
4. **Asset Discovery**: See subdomains and findings
5. **CBOM**: Review cryptography metrics
6. **Cyber Rating**: Check risk tier assessment
7. **Scanner Engine**: Manually scan targets (requires backend running)

---

## 🛠️ Development Tips

### Add a New Page
1. Create file in `src/pages/NewPage.jsx`
2. Import in `src/App.jsx`
3. Add route: `<Route path="/new-page" element={<NewPage />} />`
4. Add nav item in `src/components/Sidebar.jsx`
5. Use `dataAPI` for data loading:
   ```javascript
   const result = await dataAPI.getAssets()
   if (result.success) { /* use result.assets */ }
   ```

### Use Error Handling
```javascript
import { ErrorAlert } from '../components/DataLoaders.jsx'

if (error) return <ErrorAlert error={error} onRetry={reload} />
```

### Loading States
```javascript
import { LoadingSpinner } from '../components/DataLoaders.jsx'

if (loading) return <LoadingSpinner />
```

---

## 📝 Data File Locations

If you need to update data files:
```
public/data/
├── pnb/cbom.json                    (6480 assets with TLS details)
├── pnb/subdomains.json              (270 discovered subdomains)
├── risk/shadow-crypto.json          (12 findings - crypto issues)
├── risk/enriched_cbom.json          (6480 enriched records with scoring)
└── simulation.json                  (QVaR simulation results)
```

---

## 🐛 Troubleshooting

### "Failed to load assets"
- Check if `public/data/` folder exists and has JSON files
- Verify `data_api.py` is running on port 8001
- Check browser console for detailed errors

### "API connection failed"
- Ensure `scanner_api.py` running on port 8000
- Check `.env.local` has correct `VITE_API_BASE_URL`
- Verify firewall isn't blocking localhost:8000

### "Data loading slowly"
- JSON files in `public/data/` are ~5-7MB (6480 records each)
- First load caches in browser; subsequent loads are instant
- Consider pagination for production (limit=50 in API calls)

---

## ✨ Next Steps (Optional Enhancements)

- [ ] Add real authentication
- [ ] Implement data export to CSV/PDF
- [ ] Add WebSocket for real-time updates
- [ ] Create admin dashboard for user management
- [ ] Add database (PostgreSQL) for persistence
- [ ] Set up CI/CD pipeline
- [ ] Deploy to cloud (Vercel, Azure, AWS)

---

*Built by Team TechEncode — Vishwakarma University, Pune*  
*PSB Cybersecurity Hackathon 2026*
