@echo off
cd /d "%~dp0"
echo Starting FP simulator...
echo.
echo Keep this window open while using the simulator.
echo URL: http://localhost:5173/
echo.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173/'"
npm.cmd run dev -- --host 127.0.0.1 --port 5173
pause
