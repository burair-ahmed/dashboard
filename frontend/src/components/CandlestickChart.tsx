import { useEffect, useRef } from 'react';
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

  // Initialize chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
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
      rightPriceScale: {
        borderColor: '#243047',
      },
      timeScale: {
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

  // Load historical candles
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    if (candles.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      return;
    }

    const sorted = [...candles].sort((a, b) => a.time - b.time);
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

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Stream live candle updates
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || !latestCandle) return;

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

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <span>
          {tvSymbol} · {timeframe === 'D' ? '1D' : `${timeframe}m`}
        </span>
        <span className="panel-sub">
          {loading
            ? 'Loading TradingView candles...'
            : latestCandle
              ? `Last: ${latestCandle.close.toFixed(2)}`
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
