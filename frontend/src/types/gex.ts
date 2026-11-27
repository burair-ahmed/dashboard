export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrikeGEX {
  strike: number;
  gex: number;
  call_gex: number | null;
  put_gex: number | null;
  net_gex: number;
  total_open_interest: number | null;
}

export interface GEXLevels {
  symbol: string;
  target_symbol: string;
  timestamp: string;
  underlying_price: number;
  call_wall: number;
  put_wall: number;
  gamma_flip: number;
  bull_trigger: number;
  bear_trigger: number;
  top_positive_strikes: number[];
  top_negative_strikes: number[];
  strikes: StrikeGEX[];
  total_net_gex: number;
  regime: 'POSITIVE_GAMMA' | 'NEGATIVE_GAMMA' | string;
  compact_string: string;
  gex_pro_text: string;
}

export interface OverlayVisibility {
  walls: boolean;
  triggers: boolean;
  gammaFlip: boolean;
  secondaryStrikes: boolean;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LevelDistance {
  label: string;
  price: number;
  points: number;
  percent: number;
  role: 'resistance' | 'support' | 'pivot' | 'trigger';
}

export interface LevelAnalysis {
  spot: number;
  regime: 'POSITIVE_GAMMA' | 'NEGATIVE_GAMMA';
  regimeSummary: string;
  zoneTitle: string;
  zoneBias: 'bullish' | 'bearish' | 'neutral' | 'pin';
  zoneDetail: string;
  pinTarget: { strike: number; percentAway: number; gexM: number } | null;
  nearestResistance: { strike: number; gexM: number; pointsAway: number } | null;
  nearestSupport: { strike: number; gexM: number; pointsAway: number } | null;
  distances: LevelDistance[];
  impliedRangePct: number;
}

