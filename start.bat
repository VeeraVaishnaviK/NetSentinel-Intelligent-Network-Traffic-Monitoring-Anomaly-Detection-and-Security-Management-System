@echo off
title NetSentinel Launcher
echo ====================================================================
echo   NetSentinel - Network Traffic Monitoring & Security Management
echo ====================================================================
echo.
echo [INFO] For live Scapy packet capture and Layer-2 ARP scanning on
echo        Windows, install Npcap (https://npcap.com/) and run this
echo        script as Administrator. Without Npcap/Admin, OS telemetry,
echo        diagnostics, fallback discovery, reports, and Demo Mode work
echo        normally.
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3 was not found in PATH. Please install Python 3.10+.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js / npm was not found in PATH. Please install Node.js 18+.
    pause
    exit /b 1
)

if not exist "%~dp0frontend\node_modules" (
    echo [SETUP] Installing frontend dependencies...
    pushd "%~dp0frontend"
    call npm install
    popd
)

echo [1/2] Starting NetSentinel Flask Backend (http://127.0.0.1:5000)...
start "NetSentinel Backend" cmd /k "cd /d "%~dp0backend" && python run.py"

timeout /t 3 /nobreak >nul

echo [2/2] Starting NetSentinel React Frontend (http://localhost:5173)...
start "NetSentinel Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo [OK] NetSentinel services launched!
echo      Dashboard URL : http://localhost:5173
echo      Backend API   : http://127.0.0.1:5000/api/health
echo.
pause

