---
title: GEX TradingView Backend Service
emoji: 📈
colorFrom: indigo
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# GEX TradingView Automated Backend Service

High-performance real-time Gamma Exposure (GEX) engine powered by ITMatrixHQ.
Computes Call Walls, Put Walls, Gamma Flip transitions, and live GEX plans for TradingView charts.

## Endpoints:
- `GET /health`: Service health status
- `GET /api/levels/{symbol}`: Structured GEX levels for a given ticker (e.g. `SPY`, `QQQ`, `ES1!`)
- `GET /api/gex-pro-plan/{symbol}`: Plain text multi-line plan for GEX Levels Pro indicator
- `WS /ws/gex`: WebSocket connection for real-time live streaming to the TradingView browser extension

## Hugging Face Secrets:
Configure this secret in your Space settings (**Settings > Variables and secrets**):
- `ITMATRIX_API_KEY`: Your ITMatrixHQ API key (`itm_...`)

