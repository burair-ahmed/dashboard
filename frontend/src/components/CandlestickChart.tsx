import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, GEXLevels, OverlayVisibility } from '../types/gex';

function formatUnixTime(unixSec: number, isDaily: boolean): string {
  const d = new Date(unixSec * 1000);
  if (isDaily) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getTimeframeSeconds(timeframe: string): number {
  if (timeframe === 'D') return 86400;
  if (timeframe === 'W') return 604800;
  if (timeframe === 'M') return 2592000;
  const mins = Number(timeframe);
  return Number.isFinite(mins) && mins > 0 ? mins * 60 : 300;
}

function formatCountdown(remainingSec: number): string {
  if (remainingSec <= 0) return '00:00';
  const hrs = Math.floor(remainingSec / 3600);
  const mins = Math.floor((remainingSec % 3600) / 60);
  const secs = remainingSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

interface CandlestickChartProps {
  candles: Candle[];
  latestCandle: Candle | null;
  levels: GEXLevels | null;
  visibility: OverlayVisibility;
  tvSymbol: string;
  timeframe: string;
  loading: boolean;
}

export function CandlestickChart({
  candles,
  latestCandle,
  levels,
  visibility,
  tvSymbol,
  timeframe,
  loading,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastBarTimeRef = useRef<number>(0);
  const candlesByTimeRef = useRef<Map<number, Candle>>(new Map());
  const hasFittedRef = useRef<boolean>(false);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [countdown, setCountdown] = useState<string>('--:--');
  const isDaily = timeframe === 'D' || timeframe === 'W' || timeframe === 'M';

  // Reset initial-fit flag when switching symbol or timeframe
  useEffect(() => {
    hasFittedRef.current = false;
  }, [tvSymbol, timeframe]);

  // 1-second candle close countdown timer
  useEffect(() => {
    const updateTimer = () => {
      if (!latestCandle) {
        setCountdown('--:--');
        return;
      }
      const durationSec = getTimeframeSeconds(timeframe);
      const closeAt = latestCandle.time + durationSec;
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = closeAt - nowSec;
      if (remaining <= 0) {
        setCountdown('Closing...');
      } else {
        setCountdown(formatCountdown(remaining));
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timerId);
  }, [latestCandle, timeframe]);

  // Initialize chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth || 600,
      height: el.clientHeight || 400,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f17' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#162032' },
        horzLines: { color: '#162032' },
      },
      crosshair: {
        vertLine: { color: '#475569', labelBackgroundColor: '#1e293b' },
        horzLine: { color: '#475569', labelBackgroundColor: '#1e293b' },
      },
      localization: {
        timeFormatter: (time: number) => formatUnixTime(time, timeframe === 'D'),
      },
      rightPriceScale: {
        borderColor: '#243047',
      },
      timeScale: {
        visible: true,
        borderColor: '#243047',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || typeof param.time !== 'number') {
        setHoveredCandle(null);
        return;
      }
      const match = candlesByTimeRef.current.get(param.time);
      setHoveredCandle(match ?? null);
    });

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Load historical candles (deduplicated & sorted ascending by time)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    if (candles.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      candlesByTimeRef.current.clear();
      lastBarTimeRef.current = 0;
      return;
    }

    const dedup = new Map<number, Candle>();
    for (const c of candles) {
      if (Number.isFinite(c.time)) {
        dedup.set(c.time, c);
      }
    }
    const sorted = Array.from(dedup.values()).sort((a, b) => a.time - b.time);
    candlesByTimeRef.current = dedup;
    lastBarTimeRef.current = sorted.length > 0 ? sorted[sorted.length - 1].time : 0;

    candleSeries.setData(
      sorted.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeries.setData(
      sorted.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      }))
    );

    if (!hasFittedRef.current) {
      chartRef.current?.timeScale().fitContent();
      hasFittedRef.current = true;
    }
  }, [candles]);

  // Stream live candle updates safely
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || !latestCandle) return;
    if (latestCandle.time < lastBarTimeRef.current) return;

    lastBarTimeRef.current = latestCandle.time;
    candlesByTimeRef.current.set(latestCandle.time, latestCandle);

    candleSeries.update({
      time: latestCandle.time as UTCTimestamp,
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: latestCandle.close,
    });

    volumeSeries.update({
      time: latestCandle.time as UTCTimestamp,
      value: latestCandle.volume,
      color: latestCandle.close >= latestCandle.open ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)',
    });
  }, [latestCandle]);

  // Render GEX level overlays
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    priceLinesRef.current = [];

    if (!levels) return;

    const addLine = (
      price: number,
      title: string,
      color: string,
      lineStyle: LineStyle,
      lineWidth: 1 | 2 | 3 | 4 = 2
    ) => {
      if (!Number.isFinite(price) || price <= 0) return;
      const line = candleSeries.createPriceLine({
        price,
        color,
        lineWidth,
        lineStyle,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    if (visibility.walls) {
      addLine(levels.call_wall, 'CALL WALL', '#10b981', LineStyle.Solid, 2);
      addLine(levels.put_wall, 'PUT WALL', '#ef4444', LineStyle.Solid, 2);
    }

    if (visibility.gammaFlip) {
      addLine(levels.gamma_flip, 'GAMMA FLIP', '#f59e0b', LineStyle.Dashed, 2);
    }

    if (visibility.triggers) {
      addLine(levels.bull_trigger, 'BULL TRIG', '#06b6d4', LineStyle.Dotted, 2);
      addLine(levels.bear_trigger, 'BEAR TRIG', '#fb923c', LineStyle.Dotted, 2);
    }

    if (visibility.secondaryStrikes) {
      for (const s of levels.top_positive_strikes) {
        if (s !== levels.call_wall) {
          addLine(s, '+GEX', 'rgba(16, 185, 129, 0.55)', LineStyle.SparseDotted, 1);
        }
      }
      for (const s of levels.top_negative_strikes) {
        if (s !== levels.put_wall) {
          addLine(s, '-GEX', 'rgba(239, 68, 68, 0.55)', LineStyle.SparseDotted, 1);
        }
      }
    }
  }, [levels, visibility]);

  const activeBar = hoveredCandle ?? latestCandle;

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          <span>
            {tvSymbol} · {timeframe === 'D' ? '1D' : `${timeframe}m`}
          </span>
          <span
            style={{
              background: 'rgba(59, 130, 246, 0.16)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#93c5fd',
              padding: '2px 8px',
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
            title="Time remaining until current candle closes"
          >
            Close in {countdown}
          </span>
        </span>
        <span className="panel-sub" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {loading
            ? 'Loading TradingView candles...'
            : activeBar
              ? `${formatUnixTime(activeBar.time, isDaily)}  |  O ${activeBar.open.toFixed(2)}  H ${activeBar.high.toFixed(2)}  L ${activeBar.low.toFixed(2)}  C ${activeBar.close.toFixed(2)}`
              : 'No bars'}
        </span>
      </div>

      <div className="chart-wrap">
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#10b981' }} />
            Call Wall
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#ef4444' }} />
            Put Wall
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#f59e0b' }} />
            Gamma Flip
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#06b6d4' }} />
            Bull Trig
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#fb923c' }} />
            Bear Trig
          </span>
        </div>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </section>
  );
}
