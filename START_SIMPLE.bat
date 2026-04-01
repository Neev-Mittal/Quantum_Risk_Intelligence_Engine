@echo off
setlocal EnableExtensions

echo.
echo ============================================================
echo   QRIE Platform - Secure Local Startup
echo   Docker Postgres + Database API + Scanner API + Reports
echo ============================================================
echo.

cd /d "%~dp0"

if not exist ".local" mkdir ".local"
set "DOCKER_START_LOG=.local\docker-postgres-start.log"

echo [STEP 1/6] Bootstrapping local environment secrets...
python bootstrap_env.py
if errorlevel 1 goto :fail

echo [STEP 2/6] Starting encrypted PostgreSQL in Docker...
docker compose up -d --build --quiet-build postgres > "%DOCKER_START_LOG%" 2>&1
if errorlevel 1 (
  echo Docker startup failed. Captured output:
  type "%DOCKER_START_LOG%"
  goto :fail
)
echo [INFO] Docker PostgreSQL container started. Full log: %DOCKER_START_LOG%

echo [STEP 3/6] Waiting for PostgreSQL readiness...
python wait_for_db.py
set "DB_WAIT_RESULT=%ERRORLEVEL%"
if not "%DB_WAIT_RESULT%"=="0" if not "%DB_WAIT_RESULT%"=="10" goto :fail

set "QRIE_FORCE_SQLITE="
if "%DB_WAIT_RESULT%"=="10" (
  echo [INFO] Launching backend services with SQLite fallback for this session...
  set "QRIE_FORCE_SQLITE=true"
)

echo [STEP 4/6] Starting Database API (Port 8001)...
if defined QRIE_FORCE_SQLITE (
  start "QRIE - Database API" cmd /k "set USE_SQLITE=true&&python database_api.py"
) else (
  start "QRIE - Database API" cmd /k "python database_api.py"
)

timeout /t 2 /nobreak >nul

echo [STEP 5/6] Starting Scanner + Report APIs (Ports 8000 and 8002)...
if defined QRIE_FORCE_SQLITE (
  start "QRIE - Scanner API" cmd /k "set USE_SQLITE=true&&python scanner_api.py"
  start "QRIE - Report API" cmd /k "set USE_SQLITE=true&&python report_api.py"
) else (
  start "QRIE - Scanner API" cmd /k "python scanner_api.py"
  start "QRIE - Report API" cmd /k "python report_api.py"
)

timeout /t 2 /nobreak >nul

echo [STEP 6/6] Starting Frontend (Port 5173)...
start "QRIE - Frontend" cmd /k "npm run dev"

echo.
echo ============================================================
echo   Services are starting in separate windows
echo ============================================================
echo.
echo Access the application at:
echo   Frontend:     http://localhost:5173
echo   Data API:     http://localhost:8001
echo   Scanner API:  http://localhost:8000
echo   Report API:   http://localhost:8002
echo.
echo The local .env file now controls Docker, database, and API settings.
echo To stop Postgres later, run: docker compose down
echo.
pause
exit /b 0

:fail
echo.
echo Startup failed. Review the message above and fix the missing dependency or configuration.
pause
exit /b 1
