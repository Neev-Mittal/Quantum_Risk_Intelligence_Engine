# 🚀 QRIE Platform - Quick Reference Card

## ⚡ Quick Start (60 Seconds)

```bash
# 1. Navigate to project
cd qrie-frontend_backend

# 2. Start everything with one script (Windows)
START.bat

# OR manually start in 3 terminals:
# Terminal 1:
python scanner_api.py

# Terminal 2:
python data_api.py

# Terminal 3:
npm run dev
```

✅ Done! Open http://localhost:5173

---

## 🔐 Demo Login
- **Email**: `hackathon@pnb.com`
- **Password**: `admin123`

---

## 📂 Important Files

| File | Purpose |
|------|---------|
| `.env.local` | API configuration |
| `src/api.js` | API endpoint wrappers |
| `src/dataAPI.js` | Real data loader |
| `src/App.jsx` | Main app + ErrorBoundary |
| `data_api.py` | Python data server |
| `public/data/` | Real JSON data files |
| `SETUP_GUIDE.md` | Full documentation |

---

## 💾 Data Files Used

```
public/data/
├── pnb/cbom.json                 (6,480 assets)
├── pnb/subdomains.json           (270 subdomains)
├── risk/shadow-crypto.json       (12 findings)
├── risk/enriched_cbom.json       (6,480 enriched)
└── simulation.json               (QVaR data)
```

---

## 🧩 API Usage (In Pages)

```javascript
import dataAPI from '../dataAPI.js'

// Load assets
const result = await dataAPI.getAssets(100)
if (result.success) {
  console.log(result.assets)  // Real data
}

// Load other data
dataAPI.getSubdomains(50)
dataAPI.getCBOM()
dataAPI.getShadowCrypto()
dataAPI.getPostureOfPQC()
dataAPI.getCyberRating()
dataAPI.getBusinessImpact()
```

---

## 🎨 Tailwind Colors

```javascript
// Use these instead of hex codes
className="text-pnb-crimson"     // #8B0000
className="text-pnb-amber"       // #D97706
className="bg-pnb-gold"          // #F59E0B

// All defined in tailwind.config.js
```

---

## ⚙️ Component Patterns

### Loading + Error State
```javascript
import { LoadingSpinner, ErrorAlert } from '../components/DataLoaders.jsx'

export default function MyPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const result = await dataAPI.getAssets()
    if (result.success) setData(result.assets)
    else setError(result.error)
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorAlert error={error} onRetry={loadData} />
  
  return <div>/* Your content */</div>
}
```

---

## 📊 Pages Status

| Page | Data Source | Status |
|------|-------------|--------|
| **Home** | assets + findings | ✅ Working |
| **AssetInventory** | cbom.json | ✅ Working |
| **AssetDiscovery** | subdomains.json | 📋 Template |
| **CBOM** | cbom.json | 📋 Template |
| **PostureOfPQC** | cbom.json | 📋 Template |
| **CyberRating** | enriched_cbom.json | 📋 Template |
| **BusinessImpact** | simulation_output.json | 📋 Template |
| **Reporting** | All data | 📋 Template |
| **ScannerEngine** | Live scanning | ✅ Working |

✅ = Integrated with API  
📋 = Use as template for other pages

---

## 🔍 Data Structure

### Asset Object
```javascript
{
  id: "13313c5a-...",
  name: "aafip.pnb.bank.in",
  url: "https://aafip.pnb.bank.in",
  ip: "103.109.224.159",
  port: 443,
  tlsVersions: ["TLSv1.2", "TLSv1.3"],
  minTls: "TLSv1.2",
  maxTls: "TLSv1.3",
  tlsVersion: "TLSv1.3",
  cipherSuite: "TLS_AES_128_GCM_SHA256",
  keyBits: 2048,
  pfs: true,
  issuer: "DigiCert Inc",
  notBefore: "2025-09-02T00:00:00+00:00",
  notAfter: "2026-09-01T23:59:59+00:00",
  heiScore: 65.0,
  riskCategory: "High",
  pqcLabel: ""
}
```

---

## 🌐 Endpoints

### Data API (data_api.py)
```
GET  /api/health
GET  /api/assets?limit=100
GET  /api/cbom
GET  /api/subdomains?limit=100
GET  /api/shadow-crypto
GET  /api/pqc-posture
GET  /api/cyber-rating
GET  /api/business-impact
```

### Scanner API (scanner_api.py)
```
GET  /api/health
POST /api/scan/stream    (SSE real-time scanning)
POST /api/scan           (Blocking scan)
```

---

## 🛠️ Common Tasks

### Add New Page
```bash
# 1. Create file
# src/pages/NewPage.jsx

# 2. Update App.jsx
import NewPage from './pages/NewPage.jsx'
<Route path="/new-page" element={<NewPage />} />

# 3. Update Sidebar.jsx
{ to: '/new-page', label: 'New Page', Icon: SomeIcon }
```

### Load Data in Page
```javascript
const [data, setData] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  (async () => {
    const result = await dataAPI.getAssets()
    if (result.success) setData(result.assets)
    setLoading(false)
  })()
}, [])
```

### Style with Tailwind
```javascript
// Instead of: style={{ color: '#8B0000' }}
// Use: className="text-pnb-crimson"

className="bg-pnb-crimson text-white"
className="border-amber-300"
className="hover:bg-red-800 transition-colors"
```

---

## 🐛 Debugging

### Check if data files exist
```bash
ls public/data/pnb/cbom.json
ls public/data/risk/shadow-crypto.json
```

### Check if APIs running
```bash
# Scanner API
curl http://localhost:8000/api/health

# Data API
curl http://localhost:8001/api/health
```

### Browser console errors
- Press `F12` → Console tab
- Look for red errors
- Check network tab (F12 → Network)

---

## 📚 Documentation Files

- **SETUP_GUIDE.md** — Complete setup & architecture
- **COMPLETE_REFACTOR_SUMMARY.md** — What was fixed & why
- **DEPLOYMENT.md** — Original deployment instructions
- **README.md** — Project overview (create if needed)

---

## ✨ Key Features

✅ **Real Data** — 6,480+ assets with TLS details  
✅ **Error Handling** — All pages gracefully handle failures  
✅ **Loading States** — Visual feedback during data fetch  
✅ **PSB Branding** — Consistent throughout  
✅ **Responsive Tables** — Search + filter support  
✅ **Color System** — Tailwind classes (no hardcoded hex)  
✅ **Security** — Crypto audit, PQC readiness, Risk scoring  

---

## 🎯 What's Working

| Feature | Status |
|---------|--------|
| Login | ✅ Credentials updated |
| Home Dashboard | ✅ Shows real stats |
| Asset Inventory | ✅ 50+ assets displayed |
| Navigation | ✅ All links work |
| Error Handling | ✅ Graceful fallbacks |
| Data Loading | ✅ Fast caching |
| Styling | ✅ Professional UI |
| Branding | ✅ PSB throughout |

---

## ⚠️ Known Limitations

- Mobile: Not optimized (desktop-first)
- Data Files: ~5-7MB each (initial load takes ~2-3s)
- Real Scanning: Requires live backends running
- Fonts: Need internet (Google Fonts)

---

## 🚀 Deployment

For production:
1. Build: `npm run build` → Creates `dist/` folder
2. Deploy `dist/` to Vercel, Netlify, Azure, etc.
3. Set `VITE_API_BASE_URL` to production API URL
4. Use environment variables for secrets

---

## 📞 Quick Tips

- Data auto-caches in browser (2nd load is instant)
- Close browser tab to stop seeing spinner on reload
- Import components as: `import { LoadingSpinner } from '../components/DataLoaders.jsx'`
- Colors defined in `tailwind.config.js` under theme.extend.colors.pnb
- All JSON files are in `public/data/` (served as static assets)

---

**Need help?** Check `SETUP_GUIDE.md` → Troubleshooting section

*QRIE Platform v1.0 | PSB Hackathon 2026*
