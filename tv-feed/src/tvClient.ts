import { getCandles, watchCandles, type Candle, type CandleWatcher, type Timeframe } from '@mathieuc/tradingview';
import { normalizeTimeframe, resolveTradingViewSymbol } from './symbolResolver.js';

export type { Candle };

type CandleListener = (candle: Candle) => void;

interface ActiveStream {
  watcher: CandleWatcher;
  listeners: Set<CandleListener>;
  lastBarTime: number;
}

const streams = new Map<string, ActiveStream>();

function getCredentials() {
  const session = process.env.TV_SESSION?.trim();
  const signature = process.env.TV_SIGNATURE?.trim();
  if (session && signature) {
    return { session, signature };
  }
  return undefined;
}

export async function fetchHistoricalCandles(
  symbol: string,
  timeframe = '5',
  count = 300
): Promise<{ tvSymbol: string; timeframe: string; candles: Candle[] }> {
  const tvSymbol = resolveTradingViewSymbol(symbol);
  const tf = normalizeTimeframe(timeframe) as Timeframe;
  const safeCount = Math.min(Math.max(Number(count) || 300, 10), 2000);

  const candles = await getCandles({
    symbol: tvSymbol,
    timeframe: tf,
    count: safeCount,
    credentials: getCredentials(),
  });

  return {
    tvSymbol,
    timeframe: tf,
    candles,
  };
}

export async function subscribeToCandles(
  symbol: string,
  timeframe: string,
  listener: CandleListener,
  onError?: (err: Error) => void
): Promise<() => void> {
  const tvSymbol = resolveTradingViewSymbol(symbol);
  const tf = normalizeTimeframe(timeframe) as Timeframe;
  const key = `${tvSymbol}::${tf}`;

  let stream = streams.get(key);
  if (!stream) {
    const listeners = new Set<CandleListener>([listener]);
    let lastBarTime = 0;

    const watcher = await watchCandles(
      {
        symbol: tvSymbol,
        timeframe: tf,
        count: 20,
        credentials: getCredentials(),
      },
      {
        onData: (candles) => {
          const latest = candles.at(-1);
          if (!latest) return;
          lastBarTime = latest.time;
          const active = streams.get(key);
          if (!active) return;
          for (const cb of active.listeners) {
            cb(latest);
          }
        },
        onError: (err) => {
          console.error(`[tv-feed] Stream error for ${key}:`, err.message);
          onError?.(err);
        },
      }
    );

    stream = { watcher, listeners, lastBarTime };
    streams.set(key, stream);
  } else {
    stream.listeners.add(listener);
    const latest = stream.watcher.latest.at(-1);
    if (latest) {
      listener(latest);
    }
  }

  return () => {
    const active = streams.get(key);
    if (!active) return;
    active.listeners.delete(listener);
    if (active.listeners.size === 0) {
      streams.delete(key);
      void active.watcher.stop().catch((err) => {
        console.error(`[tv-feed] Error stopping watcher for ${key}:`, err);
      });
    }
  };
}

