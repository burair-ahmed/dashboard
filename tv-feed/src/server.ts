import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fetchHistoricalCandles, subscribeToCandles } from './tvClient.js';
import { normalizeTimeframe, resolveTradingViewSymbol } from './symbolResolver.js';

const PORT = Number(process.env.PORT || 4001);
const app = express();

app.use(cors());
app.use(express.json());

app.get(['/health', '/api/tv/health'], (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'TradingView Market Data Feed',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/tv/candles', async (req, res) => {
  const symbol = String(req.query.symbol || 'SPY');
  const timeframe = normalizeTimeframe(req.query.timeframe ? String(req.query.timeframe) : '5');
  const count = Number(req.query.count || 300);

  try {
    const data = await fetchHistoricalCandles(symbol, timeframe, count);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      symbol: symbol.toUpperCase(),
      ...data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch TradingView candles';
    console.error(`[tv-feed] REST error for ${symbol} (${timeframe}):`, message);
    res.status(502).json({
      error: message,
      symbol: symbol.toUpperCase(),
      tvSymbol: resolveTradingViewSymbol(symbol),
      timeframe,
    });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/tv' });

wss.on('connection', (ws: WebSocket) => {
  let unsubscribeCurrent: (() => void) | null = null;
  let activeSymbol = '';
  let activeTimeframe = '';

  const cleanup = () => {
    if (unsubscribeCurrent) {
      unsubscribeCurrent();
      unsubscribeCurrent = null;
    }
  };

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        action?: string;
        symbol?: string;
        timeframe?: string;
      };

      if (msg.action === 'subscribe') {
        const symbol = (msg.symbol || 'SPY').trim().toUpperCase();
        const timeframe = normalizeTimeframe(msg.timeframe);

        if (symbol === activeSymbol && timeframe === activeTimeframe && unsubscribeCurrent) {
          return;
        }

        cleanup();
        activeSymbol = symbol;
        activeTimeframe = timeframe;

        try {
          unsubscribeCurrent = await subscribeToCandles(
            symbol,
            timeframe,
            (candle) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'CANDLE_UPDATE',
                    symbol,
                    tvSymbol: resolveTradingViewSymbol(symbol),
                    timeframe,
                    candle,
                  })
                );
              }
            },
            (err) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'ERROR',
                    message: err.message,
                  })
                );
              }
            }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Subscription failed';
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ERROR', message }));
          }
        }
      } else if (msg.action === 'unsubscribe') {
        cleanup();
        activeSymbol = '';
        activeTimeframe = '';
      }
    } catch {
      // Ignore malformed JSON frames
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

if (!process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[tv-feed] Listening on http://0.0.0.0:${PORT}`);
  });
}

export default app;

