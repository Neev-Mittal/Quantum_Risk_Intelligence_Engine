# QRIE Frontend — Deployment Guide
**Project:** Quantum Risk Intelligence Engine (QRIE)  
**Team:** TechEncode · Vishwakarma University  
**Hackathon:** PNB Cybersecurity Hackathon 2026

---

## Tech Stack

| Layer        | Technology                     |
|--------------|-------------------------------|
| Framework    | React 18 + Vite                |
| Styling      | Tailwind CSS 3                 |
| Routing      | React Router DOM v6            |
| Charts       | Recharts                       |
| Icons        | Lucide React                   |
| Fonts        | Oxanium (display), DM Sans (body) via Google Fonts |

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+ (check: `node -v`)
- npm 9+ (check: `npm -v`)
- Python 3.9+ (check: `python --version`)

### Steps — run BOTH servers

**Terminal 1 — Python scanner backend:**
```bash
cd qrie-frontend
pip install -r requirements.txt
python scanner_api.py
```

**Terminal 2 — React frontend:**
```bash
cd qrie-frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.  
**Demo login:** any email + any password.

> The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`.

### Scanner API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/scan/stream` | SSE streaming scan (used by UI) |
| POST | `/api/scan` | Blocking scan — returns full JSON |

---

## Production Build

```bash
# Build optimised static files → ./dist/
npm run build

# Preview the production build locally
npm run preview
```

---

## Deployment Options

### Option A — Vercel (Recommended, Free)

1. Push the project to a GitHub/GitLab repository.
2. Go to https://vercel.com → **New Project** → Import your repo.
3. Vercel auto-detects Vite. Leave settings as default.
4. Click **Deploy**. Done. You get a live HTTPS URL instantly.

**Environment variables (if backend added later):**
```
VITE_API_BASE_URL=https://your-backend-api.com
```

---

### Option B — Netlify (Free)

```bash
npm run build
```

- Go to https://netlify.com → **Add new site** → **Deploy manually**.
- Drag and drop the `dist/` folder into the deploy zone.

Or via Netlify CLI:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

---

### Option C — Docker (For Server / On-Premise)

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Build & run:

```bash
docker build -t qrie-frontend .
docker run -p 80:80 qrie-frontend
```

Access at http://localhost.

---

### Option D — Static Server (Simplest)

```bash
npm run build
npx serve dist
```

---

## Connecting to the FastAPI Backend

In `src/` create a file `api.js`:

```js
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = {
  getAssets:       () => fetch(`${BASE}/api/assets`).then(r => r.json()),
  getCBOM:         () => fetch(`${BASE}/api/cbom`).then(r => r.json()),
  getPQCPosture:   () => fetch(`${BASE}/api/pqc-posture`).then(r => r.json()),
  getCyberRating:  () => fetch(`${BASE}/api/cyber-rating`).then(r => r.json()),
  getDiscovery:    () => fetch(`${BASE}/api/discovery`).then(r => r.json()),
  triggerScan:     (targets) => fetch(`${BASE}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets }),
  }).then(r => r.json()),
}
```

Then replace the static mock data in each page with `useEffect` + `api.*` calls.

---

## Project Structure

```
qrie-frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── src/
    ├── main.jsx              ← React entry
    ├── App.jsx               ← Routes + Auth gate
    ├── index.css             ← Global styles + Tailwind
    ├── components/
    │   ├── Layout.jsx        ← Sidebar + Header wrapper
    │   ├── Sidebar.jsx       ← Navigation sidebar
    │   ├── Header.jsx        ← Top bar with logo & user
    │   └── PNBShield.jsx     ← SVG shield logo
    └── pages/
        ├── Login.jsx         ← Login screen
        ├── Home.jsx          ← Dashboard (Asset Inventory home)
        ├── AssetInventory.jsx← Full inventory table
        ├── AssetDiscovery.jsx← Domains/SSL/IP/Software tabs
        ├── CBOM.jsx          ← Cryptographic Bill of Materials
        ├── PostureOfPQC.jsx  ← PQC Compliance Dashboard
        ├── CyberRating.jsx   ← Tier rating system
        └── Reporting.jsx     ← Exec / Scheduled / On-Demand
```

---

## Environment Variables

| Variable             | Default                   | Description          |
|----------------------|---------------------------|----------------------|
| `VITE_API_BASE_URL`  | `http://localhost:8000`   | FastAPI backend URL  |

Create a `.env.local` file:
```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Notes for the Hackathon Judges

- All pages match the prototype expectations PDF exactly.
- The login demo accepts any non-empty password.
- Static mock data is used — swap `src/pages/*.jsx` data arrays with API calls.
- The PNB shield SVG logo is hand-drawn in code (no external assets needed).
- Fonts load from Google Fonts CDN; ensure internet access during demo.

---

*Built by Team TechEncode — Vishwakarma University, Pune*
