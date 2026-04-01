# PostgreSQL Database Setup for QRIE Platform

This guide walks through setting up PostgreSQL and populating it with data from the JSON files.

## Prerequisites

### Option A: Local PostgreSQL Installation

- **Windows**: Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)
- **Mac**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql postgresql-contrib`

### Option B: Docker (Recommended)

- Install Docker: [docker.com](https://docker.com)
- Docker Compose will handle everything automatically

## Quick Start (Docker - Recommended)

### 1. Start PostgreSQL with Docker Compose

```bash
# Navigate to project directory
cd c:\Users\RAYYAL\Downloads\qrie-frontend_backend

# Start PostgreSQL and pgAdmin
docker-compose up -d

# Verify containers are running
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE                 STATUS
abc123...      postgres:16-alpine    Up 2 seconds
def456...      dpage/pgadmin4        Up 2 seconds
```

### 2. Load Initial Data into Database

```bash
# Install Python dependencies (if not already done)
pip install -r requirements.txt

# Load data from JSON files into PostgreSQL
python load_data.py
```

You should see output like:
```
============================================================
QRIE Platform - Database Data Loader
============================================================

✓ Found cbom data: [.../public/data/PNB/cbom.json]
✓ Found subdomains data: [.../public/data/PNB/subdomains.json]
...

Loading CBOM data from .../public/data/PNB/cbom.json...
Found 6480 records to import
  Imported 500 assets...
  Imported 1000 assets...
...
✓ CBOM Import complete: 6480 imported, 0 skipped

Database Summary:
  Assets: 6480
  Subdomains: 270
  Findings: 12
  Simulation Scenarios: 3
```

### 3. Start the Application

```bash
# Start all services (frontend, scanner API, database API)
./START.bat
```

Or manually:
```bash
# Terminal 1: Python Scanner API
python scanner_api.py

# Terminal 2: Python Database API
python database_api.py

# Terminal 3: Frontend
npm run dev
```

Access the application:
- **Frontend**: http://localhost:5173
- **Database API**: http://localhost:8001/docs (Swagger UI)
- **pgAdmin**: http://localhost:5050 (pgAdmin4 - optional)

---

## Manual PostgreSQL Setup (Windows)

### 1. Install PostgreSQL

```bash
# Download and run installer from postgresql.org
# During installation:
# - Password: postgres (or choose your own)
# - Port: 5432 (default)
# - Components: PostgreSQL Server, pgAdmin 4 (recommended)
```

### 2. Create Database and User

Open **pgAdmin 4** or **psql** (PostgreSQL command line):

```sql
-- Connect to default postgres database
-- Create new database
CREATE DATABASE qrie_platform;

-- Create dedicated user (optional, but recommended)
CREATE USER qrie_user WITH PASSWORD 'secure_password';

-- Grant privileges
ALTER ROLE qrie_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE qrie_platform TO qrie_user;

-- Connect to the new database
\c qrie_platform

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO qrie_user;
```

### 3. Configure Environment

Update `.env.local` (create from `.env.example`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=qrie_platform
DB_USER=qrie_user
DB_PASSWORD=secure_password
```

### 4. Create Tables and Load Data

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database and load data
python load_data.py
```

---

## Verify Database Setup

### Check Database Connection

```bash
# Install psycopg2-binary if not already installed
pip install psycopg2-binary

# Test connection with Python
python
```

```python
from src.models import get_database_url, init_db
from sqlalchemy import text

# Initialize and test
engine = init_db()
with engine.connect() as conn:
    result = conn.execute(text("SELECT 1"))
    print("✓ Database connection successful!")
```

### Check Data in Database

```bash
# Using psql (command line)
psql -U postgres -d qrie_platform

# SQL queries
SELECT COUNT(*) FROM assets;           -- Should show 6480
SELECT COUNT(*) FROM subdomains;       -- Should show 270
SELECT COUNT(*) FROM security_findings; -- Should show 12
SELECT COUNT(*) FROM simulation_scenarios; -- Should show 3
```

Or use pgAdmin 4 GUI:
1. Open http://localhost:5050
2. Login with `admin@qrie.local` / `admin`
3. Register server: `localhost:5432`
4. Browse tables under `qrie_platform` database

---

## Database Schema

### Assets Table
```
id (UUID, PK)      - Unique asset identifier
fqdn (VARCHAR)     - Fully qualified domain name
ip_address (VARCHAR)
port (INTEGER)     - Default 443
tls_supported (BOOLEAN)
supported_tls_versions (JSON) - ["TLSv1.2", "TLSv1.3"]
min_tls, max_tls   - TLS version range
cipher_suite       - Active cipher suite
key_size           - RSA/ECDSA key bits
hei_score (FLOAT)  - 0-100 security score
risk_category      - Critical/High/Medium/Low
pqc_readiness      - NIST PQC label
created_at, updated_at
```

### Subdomains Table
```
id (INTEGER, PK)
fqdn (VARCHAR, UNIQUE) - Full subdomain name
parent_domain (VARCHAR) - Parent domain
ips (JSON)         - Array of IP addresses
status             - resolved/unresolved
sources (JSON)     - Discovery tools used ["subfinder"]
resolved_at        - Discovery timestamp
```

### Security Findings Table
```
id (INTEGER, PK)
finding_type       - weak_tls, self_signed_cert, cert_mismatch
severity           - critical/high/medium/low
asset_id (FK)      - Link to Asset
fqdn, ip_address, port
description        - Human-readable finding
recommendation     - Remediation advice
details (JSON)     - Technical details
```

### Simulation Scenarios Table
```
id (INTEGER, PK)
scenario_name      - Aggressive/Moderate/Conservative
blast_radius       - Number of affected assets
direct_loss_min/max - USD impact
indirect_loss_min/max
probability_percent - 0-100
qvar_value         - Quantile Value at Risk
recovery_time_hours
```

---

## API Usage

Once the database is populated, use the **Database API** endpoints:

### Get Assets
```bash
curl "http://localhost:8001/api/assets?limit=100"
```

### Get Specific Asset
```bash
curl "http://localhost:8001/api/assets/{asset_id}"
```

### Search Assets by Domain
```bash
curl "http://localhost:8001/api/assets/search/pnb.bank.in"
```

### Get Security Findings
```bash
curl "http://localhost:8001/api/shadow-crypto?severity=high"
```

### Get Statistics
```bash
curl "http://localhost:8001/api/statistics"
```

### Get Cyber Rating
```bash
curl "http://localhost:8001/api/cyber-rating"
```

Full API documentation available at:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

---

## Troubleshooting

### Issue: "could not connect to server"

**Cause**: PostgreSQL is not running or not accessible

**Solution**:
```bash
# Check if PostgreSQL is running
docker ps  # If using Docker
# or
pg_isready -h localhost -p 5432  # Windows/Mac/Linux

# Start PostgreSQL service
# Docker: docker-compose up -d postgres
# Service: net start postgresql-x64-16 (Windows)
# Brew: brew services start postgresql (Mac)
```

### Issue: "CreateDB role does not exist"

**Cause**: Database user doesn't have CREATE privilege

**Solution**:
```sql
ALTER ROLE qrie_user CREATEDB;
```

### Issue: "Relation does not exist" when running load_data.py

**Cause**: Tables not created yet

**Solution**:
```bash
# Models are auto-created by init_db() in load_data.py
# But ensure this line runs first:
python -c "from src.models import init_db; init_db()"
```

### Issue: Data load script runs but no data appears

**Cause**: JSON files might be in wrong location or script didn't commit

**Solution**:
1. Verify JSON files exist: `c:\...\public\data\PNB\cbom.json`
2. Check script output for errors
3. Manually test insert:
   ```python
   from src.models import Asset, get_session
   session = get_session()
   assets = session.query(Asset).count()
   print(f"Assets in database: {assets}")
   ```

### Issue: Port 5432 already in use

**Solution**:
```bash
# Use different port in docker-compose.yml
# Change: "5432:5432" to "5432:5433"
# Update DB_PORT in .env.local to 5433
```

---

## Performance Optimization

For large datasets, consider these optimizations:

### Add Indexes
```sql
-- Indexes are created automatically by SQLAlchemy models
-- But you can add custom ones:
CREATE INDEX idx_asset_risk ON assets(risk_category);
CREATE INDEX idx_finding_severity ON security_findings(severity);
```

### Batch Loading
```python
# The load_data.py already batches every 500 records
# Adjust BATCH_SIZE in load_data.py if needed:
if imported % BATCH_SIZE == 0:
    session.commit()
```

### Connection Pooling
```python
# database_api.py uses SQLAlchemy connection pooling by default
# Adjust pool size if needed:
engine = create_engine(
    db_url,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
)
```

---

## Backup and Maintenance

### Backup Database
```bash
# Using pg_dump
pg_dump -U postgres -d qrie_platform > backup.sql

# Using Docker
docker exec qrie-postgres pg_dump -U postgres qrie_platform > backup.sql
```

### Restore Database
```bash
psql -U postgres -d qrie_platform < backup.sql
```

### Reset Database (Development Only!)
```bash
# Drop all data
python -c "from src.models import Base, init_db; Base.metadata.drop_all(init_db())"

# Reload from JSON
python load_data.py
```

---

## Production Deployment

For production environments:

1. **Use managed PostgreSQL** (AWS RDS, Azure PostgreSQL, DigitalOcean, etc.)
2. **Strong passwords** - Don't use defaults
3. **SSL/TLS connections** - Use `postgresql+psycopg2://...` with SSL mode
4. **Backups** - Enable automated daily backups
5. **Monitoring** - Set up alerts for disk/connection usage
6. **Connection limiting** - Use PgBouncer for connection pooling
7. **Read replicas** - For analytics queries to not impact main DB

Example production connection string:
```
postgresql://user:password@prod-db-host.rds.amazonaws.com:5432/qrie_platform?sslmode=require
```

---

## Next Steps

1. ✅ PostgreSQL is ready with all data loaded
2. Run `./START.bat` to start all services
3. Access frontend at http://localhost:5173
4. Check API docs at http://localhost:8001/docs
5. Update pages to use database API endpoints (already configured in dataAPI.js)

For questions, see QUICK_REFERENCE.md or SETUP_GUIDE.md
