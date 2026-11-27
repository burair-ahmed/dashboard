const TV_SYMBOL_MAP: Record<string, string> = {
  SPY: 'AMEX:SPY',
  SPX: 'SP:SPX',
  SPXW: 'SP:SPX',
  ES: 'CME_MINI:ES1!',
  'ES1!': 'CME_MINI:ES1!',
  'ES2!': 'CME_MINI:ES2!',
  QQQ: 'NASDAQ:QQQ',
  NDX: 'NASDAQ:NDX',
  NQ: 'CME_MINI:NQ1!',
  'NQ1!': 'CME_MINI:NQ1!',
  'NQ2!': 'CME_MINI:NQ2!',
  GLD: 'AMEX:GLD',
  GC: 'COMEX:GC1!',
  'GC1!': 'COMEX:GC1!',
  XAUUSD: 'OANDA:XAUUSD',
  SLV: 'AMEX:SLV',
  SI: 'COMEX:SI1!',
  'SI1!': 'COMEX:SI1!',
  XAGUSD: 'OANDA:XAGUSD',
};

const VALID_TIMEFRAMES = new Set(['1', '3', '5', '15', '30', '45', '60', '120', '240', 'D', 'W', 'M']);

export function resolveTradingViewSymbol(input: string): string {
  const cleaned = (input || 'SPY').trim().toUpperCase();
  if (cleaned.includes(':')) {
    return cleaned;
  }
  return TV_SYMBOL_MAP[cleaned] ?? cleaned;
}

export function normalizeTimeframe(tf: string | undefined): string {
  const cleaned = (tf || '5').trim().toUpperCase();
  if (VALID_TIMEFRAMES.has(cleaned)) {
    return cleaned;
  }
  return '5';
}
