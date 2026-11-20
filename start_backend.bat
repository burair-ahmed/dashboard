@echo off
echo ========================================================
echo Starting TradingView GEX Automation Backend Service
echo Host: http://127.0.0.1:7860
echo WebSocket: ws://127.0.0.1:7860/ws/gex
echo ========================================================
set PYTHONPATH=%~dp0backend
python -m uvicorn app.main:app --app-dir "%~dp0backend" --host 127.0.0.1 --port 7860 --reload
pause
