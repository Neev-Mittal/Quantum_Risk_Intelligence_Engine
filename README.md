# QRIE: Quantum Risk Intelligence Engine

QRIE is a comprehensive cybersecurity platform designed for the PSB Hackathon 2026. It provides advanced asset discovery, CBOM (Cryptographic Bill of Materials) analysis, and PQC (Post-Quantum Cryptography) posture assessment.

## Quick Start

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Quantum_Risk_Intelligence_Engine-main
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   pip install -r requirements.txt
   ```

### Running the Project

The quickest way to start the full local stack on Windows is:

```bash
START_SIMPLE.bat
```

That script now:

1. Creates a local `.env` with secure development secrets if it does not exist.
2. Starts the Dockerized PostgreSQL instance with SSL enabled.
3. Waits for the database to become reachable.
4. Launches the database API, scanner API, report API, and frontend.

If local PostgreSQL is unavailable or the Docker volume still has an older
`qrie_app` password, the Python APIs automatically fall back to a seeded local
SQLite database at `.local/qrie_local.sqlite3` so the frontend can still run.
You can force that mode by setting `USE_SQLITE=true` in `.env`.

#### Manual Startup

**Terminal 1: Bootstrap environment**
```bash
python bootstrap_env.py
```

**Terminal 2: PostgreSQL (Docker)**
```bash
docker compose up -d postgres
python wait_for_db.py
```

**Terminal 3: Database API (Port 8001)**
```bash
python database_api.py
```

**Terminal 4: Scanner API (Port 8000)**
```bash
python scanner_api.py
```

**Terminal 5: Report API (Port 8002)**
```bash
python report_api.py
```

**Terminal 6: Frontend (Port 5173)**
```bash
npm run dev
```

### Optional NVIDIA-Powered Chatbot

QRIE can now expose an in-app AI assistant through the floating `QRIE Copilot` button that appears across authenticated pages.

To enable it:

1. Add your NVIDIA key to `.env`
   ```bash
   NVIDIA_API_KEY=your-nvidia-api-key
   ```
2. Optionally override the default model
   ```bash
   NVIDIA_CHAT_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1
   ```
3. Restart `database_api.py` so the new environment variables are loaded.

The frontend never sends your NVIDIA key directly. QRIE proxies chatbot requests through the database API at `/api/chatbot`, which then calls NVIDIA's OpenAI-compatible chat completions endpoint.

## Demo Access

The login flow now uses two steps for every approved demo account:

1. Enter the username/email and passcode for one of the demo users below.
2. Complete the second factor with a 6-digit TOTP code from a free authenticator app.

The app exposes a scannable QR code, a manual key, and an `otpauth://` URI on the login screen after password verification, so there is no SMS charge and no paid OTP gateway dependency.

### Demo Usernames and Passcodes

| Role | Username | Email | Passcode |
| --- | --- | --- | --- |
| Administrator | `admin` | `admin@pnb.com` | `Admin@123` |
| PNB Checker | `checker` | `checker@pnb.com` | `Checker@123` |
| Compliance Auditor | `auditor` | `auditor@pnb.com` | `Auditor@123` |
| IT Administrator | `itops` | `itops@pnb.com` | `ITOps@123` |

After password verification, add the selected demo user to any TOTP-compatible authenticator app such as Google Authenticator, Microsoft Authenticator, 2FAS, or Aegis, then enter the live 6-digit OTP to finish sign-in.

## Tech Stack
- **Frontend:** React, Vite, Tailwind CSS, Lucide Icons
- **Backend:** Python (FastAPI), Dockerized PostgreSQL with encrypted compatibility payload storage
- **Analysis:** PQC Enrichment Scripts, CBOM Scanner

## License
This project is licensed under the terms provided in the LICENSE file.
