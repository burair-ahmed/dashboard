import { useEffect, useState } from 'react';
import type { ConnectionState, GEXLevels } from '../types/gex';

interface UseGexLevelsResult {
  levels: GEXLevels | null;
  loading: boolean;
  error: string | null;
  status: ConnectionState;
  refresh: () => void;
}

export function useGexLevels(symbol: string): UseGexLevelsResult {
  const [levels, setLevels] = useState<GEXLevels | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [reloadNonce, setReloadNonce] = useState(0);

  const refresh = () => setReloadNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchLevels() {
      try {
        const res = await fetch(`/api/levels/${encodeURIComponent(symbol)}`);
        if (!res.ok) {
          throw new Error(`GEX API HTTP ${res.status}`);
        }
        const data: GEXLevels = await res.json();
        if (!cancelled) {
          setLevels(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch GEX levels');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchLevels();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/gex`;
    setStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (cancelled) return;
      setStatus('connected');
      ws.send(JSON.stringify({ action: 'subscribe', symbol }));
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === 'SNAPSHOT' || msg.type === 'UPDATE') && msg.data) {
          const payload: GEXLevels = msg.data;
          if (payload.target_symbol.toUpperCase() === symbol.toUpperCase()) {
            setLevels(payload);
          }
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      if (!cancelled) setStatus('error');
    };

    ws.onclose = () => {
      if (!cancelled) setStatus('disconnected');
    };

    return () => {
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbol }));
      }
      ws.close();
    };
  }, [symbol, reloadNonce]);

  return { levels, loading, error, status, refresh };
}
