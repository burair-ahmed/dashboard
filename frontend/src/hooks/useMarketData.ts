import { useEffect, useRef, useState } from 'react';
import type { Candle, ConnectionState } from '../types/gex';

interface UseMarketDataResult {
  candles: Candle[];
  latestCandle: Candle | null;
  tvSymbol: string;
  loading: boolean;
  error: string | null;
  status: ConnectionState;
}

export function useMarketData(symbol: string, timeframe: string): UseMarketDataResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [tvSymbol, setTvSymbol] = useState<string>(symbol);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCandles([]);
    setLatestCandle(null);

    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/tv/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&count=300`
        );
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        if (cancelled) return;
        const bars: Candle[] = Array.isArray(body.candles) ? body.candles : [];
        setCandles(bars);
        setLatestCandle(bars.length > 0 ? bars[bars.length - 1] : null);
        setTvSymbol(body.tvSymbol || symbol);
        setError(null);
        setStatus((prev) => (prev === 'connected' ? prev : 'connected'));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load TradingView candles');
          setStatus('error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tv`;
    setStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setStatus('connected');
      ws.send(JSON.stringify({ action: 'subscribe', symbol, timeframe }));
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'CANDLE_UPDATE' && msg.candle) {
          const incoming: Candle = msg.candle;
          setLatestCandle(incoming);
          if (msg.tvSymbol) setTvSymbol(msg.tvSymbol);
        } else if (msg.type === 'ERROR' && msg.message) {
          setError(msg.message);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      // Keep REST polling active; status is driven by REST success/failure
    };

    ws.onclose = () => {
      // Keep REST polling active; status is driven by REST success/failure
    };

    // REST polling fallback when WebSocket is unavailable (e.g., serverless deployments)
    const pollInterval = window.setInterval(() => {
      if (!cancelled && ws.readyState !== WebSocket.OPEN) {
        void loadHistory();
      }
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbol, timeframe }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, timeframe]);

  return { candles, latestCandle, tvSymbol, loading, error, status };
}
