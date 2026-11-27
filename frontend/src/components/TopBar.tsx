import { Activity, Layers, RefreshCw } from 'lucide-react';
import type { ConnectionState, OverlayVisibility } from '../types/gex';

const SYMBOLS = ['SPY', 'QQQ', 'ES1!', 'NQ1!', 'SPX', 'NDX', 'GLD', 'GC1!', 'SLV', 'SI1!'];

const TIMEFRAMES = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1h', value: '60' },
  { label: '4h', value: '240' },
  { label: '1D', value: 'D' },
];

interface TopBarProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (sym: string) => void;
  onTimeframeChange: (tf: string) => void;
  visibility: OverlayVisibility;
  onToggleVisibility: (key: keyof OverlayVisibility) => void;
  tvStatus: ConnectionState;
  gexStatus: ConnectionState;
  onRefreshGex: () => void;
}

export function TopBar({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  visibility,
  onToggleVisibility,
  tvStatus,
  gexStatus,
  onRefreshGex,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-group">
        <div className="brand">
          <Activity size={17} color="#3b82f6" />
          <span>GEX TERMINAL</span>
          <span className="brand-badge">TV LIVE</span>
        </div>

        <select
          className="select-control"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          aria-label="Select Instrument"
        >
          {SYMBOLS.map((sym) => (
            <option key={sym} value={sym}>
              {sym}
            </option>
          ))}
        </select>

        <div className="tf-group" role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              className={`tf-btn ${timeframe === tf.value ? 'active' : ''}`}
              onClick={() => onTimeframeChange(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-group">
        <button
          type="button"
          className={`toggle-btn ${visibility.walls ? 'active' : ''}`}
          onClick={() => onToggleVisibility('walls')}
        >
          <Layers size={13} />
          Walls
        </button>
        <button
          type="button"
          className={`toggle-btn ${visibility.gammaFlip ? 'active' : ''}`}
          onClick={() => onToggleVisibility('gammaFlip')}
        >
          Gamma Flip
        </button>
        <button
          type="button"
          className={`toggle-btn ${visibility.triggers ? 'active' : ''}`}
          onClick={() => onToggleVisibility('triggers')}
        >
          Triggers
        </button>
        <button
          type="button"
          className={`toggle-btn ${visibility.secondaryStrikes ? 'active' : ''}`}
          onClick={() => onToggleVisibility('secondaryStrikes')}
        >
          Top Strikes
        </button>
      </div>

      <div className="topbar-group">
        <div className="status-pill" title="TradingView @mathieuc/tradingview WebSocket">
          <span className={`dot ${tvStatus}`} />
          <span>TV Feed</span>
        </div>
        <div className="status-pill" title="FastAPI GEX Backend WebSocket">
          <span className={`dot ${gexStatus}`} />
          <span>GEX Engine</span>
        </div>
        <button type="button" className="copy-btn" onClick={onRefreshGex} title="Refresh GEX Levels">
          <RefreshCw size={12} />
          Sync
        </button>
      </div>
    </header>
  );
}
