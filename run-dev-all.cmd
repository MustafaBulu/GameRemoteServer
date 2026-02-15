@echo off
cd /d "%~dp0"

:run
cls
echo Starting GameRemoteServer (WebRTC + PC Agent)...
echo Press Ctrl+C to stop processes and return to menu.
echo.
npm run dev:all

echo.
choice /C RQ /N /M "Press R to restart, Q to quit: "
if errorlevel 2 goto end
if errorlevel 1 goto run

:end
