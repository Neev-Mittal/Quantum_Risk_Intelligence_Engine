# QRIE: Quantum Risk Intelligence Engine

QRIE is a comprehensive cybersecurity platform designed for the PSB Hackathon 2026. It provides advanced asset discovery, CBOM (Cryptographic Bill of Materials) analysis, and PQC (Post-Quantum Cryptography) posture assessment.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd No-Lookie-main
   ```

2. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```

3. **Install Backend Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

### Running the Project

The easiest way to start the entire stack on Windows is using the provided batch file:

```bash
START.bat
```

#### Manual Startup (3 Terminals Required)

**Terminal 1: Scanner API (Port 8000)**
```bash
python scanner_api.py
```

**Terminal 2: Data API (Port 8001)**
```bash
python data_api.py
```

**Terminal 3: Frontend (Port 5173)**
```bash
npm run dev
```

## 🔐 Authentication
Access the portal using the following credentials:
- **Email:** `hackathon@pnb.com`
- **Password:** `admin123`

## 🛠️ Tech Stack
- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons
- **Backend:** Python (FastAPI/Flask), SQLite/PostgreSQL
- **Analysis:** PQC Enrichment Scripts, CBOM Scanner

## 📄 License
This project is licensed under the terms provided in the LICENSE file.
