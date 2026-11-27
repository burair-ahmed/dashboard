@echo off
echo Starting GEX TradingView Dashboard Stack...

start "GEX Backend (FastAPI :7860)" cmd /k "cd /d d:\dashboard\backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 7860 --reload"
start "TradingView Feed (Node :4001)" cmd /k "cd /d d:\dashboard\tv-feed && npm run dev"
start "GEX Frontend (Vite :5173)" cmd /k "cd /d d:\dashboard\frontend && npm run dev"

echo All three services launched. Open http://localhost:5173 in your browser.
