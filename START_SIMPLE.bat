@echo off
REM QRIE Platform - Simplified Startup Script
REM Updated for PSB Hackathon 2026

echo.
echo ============================================================
echo   PSB Cybersecurity Hackathon - QRIE Platform
echo   Quantum Risk Intelligence Engine (v1.0)
echo ============================================================
echo.

REM Change to project directory
cd /d "%~dp0"

echo [STEP 1/4] Starting Scanner API (Port 8000)...
start "QRIE - Scanner API" cmd /k "python scanner_api.py"

timeout /t 2 /nobreak

echo [STEP 2/4] Starting Data API (Port 8001)...
start "QRIE - Data API" cmd /k "python data_api.py"

timeout /t 2 /nobreak

echo [STEP 3/4] Starting Frontend (Port 5173)...
start "QRIE - Frontend" cmd /k "npm run dev"

timeout /t 5 /nobreak

echo.
echo ============================================================
echo   Services are starting in separate windows!
echo ============================================================
echo.
echo Access the application at:
echo   Frontend: http://localhost:5173
echo   Data API: http://localhost:8001
echo   Scan API: http://localhost:8000
echo.
echo 🔐 Login Credentials:
echo   Email:    hackathon@pnb.com
echo   Password: admin123
echo.
echo ------------------------------------------------------------
echo To stop everything, close the three command windows.
echo ------------------------------------------------------------
echo.
pause
