import type { GEXLevels, LevelAnalysis, LevelDistance } from '../types/gex';

function pctDiff(target: number, spot: number): number {
  if (!spot) return 0;
  return ((target - spot) / spot) * 100;
}

export function analyzeGexLevels(levels: GEXLevels, livePrice?: number): LevelAnalysis {
  const spot = livePrice && livePrice > 0 ? livePrice : levels.underlying_price;
  const isPositive = levels.total_net_gex >= 0 || levels.regime === 'POSITIVE_GAMMA';
  const regime = isPositive ? 'POSITIVE_GAMMA' : 'NEGATIVE_GAMMA';

  const regimeSummary = isPositive
    ? 'Dealers are long gamma: dips tend to be bought and rallies sold (mean-reverting, lower realized volatility).'
    : 'Dealers are short gamma: hedging amplifies directional moves (momentum / trend expansion, higher volatility).';

  // Zone & signal classification
  let zoneTitle = 'Inside Rejection / Neutral Zone';
  let zoneBias: LevelAnalysis['zoneBias'] = 'neutral';
  let zoneDetail = `Price is between Bear Trigger (${levels.bear_trigger.toFixed(2)}) and Bull Trigger (${levels.bull_trigger.toFixed(2)}). Expect chop or mean-reversion until a trigger breaks and holds.`;

  if (spot >= levels.call_wall) {
    zoneTitle = 'Above Call Wall (Overextended / Pin Risk)';
    zoneBias = 'pin';
    zoneDetail = `Price is at or above Call Wall (${levels.call_wall.toFixed(2)}). Watch for dealer supply / profit-taking or a gamma squeeze if Call Wall rolls higher.`;
  } else if (spot <= levels.put_wall) {
    zoneTitle = 'Below Put Wall (Capitulation / Bounce Watch)';
    zoneBias = 'bearish';
    zoneDetail = `Price is below Put Wall (${levels.put_wall.toFixed(2)}). High volatility zone; watch for Put Wall reclaim for a sharp mean-reversion bounce.`;
  } else if (spot > levels.bull_trigger && spot >= levels.gamma_flip) {
    zoneTitle = 'Bullish Control (Above Bull Trigger & Gamma Flip)';
    zoneBias = 'bullish';
    zoneDetail = `Price is holding above Bull Trigger (${levels.bull_trigger.toFixed(2)}) and Gamma Flip (${levels.gamma_flip.toFixed(2)}). Upside path toward Call Wall (${levels.call_wall.toFixed(2)}).`;
  } else if (spot < levels.bear_trigger && spot < levels.gamma_flip) {
    zoneTitle = 'Bearish Control (Below Bear Trigger & Gamma Flip)';
    zoneBias = 'bearish';
    zoneDetail = `Price is below Bear Trigger (${levels.bear_trigger.toFixed(2)}) and Gamma Flip (${levels.gamma_flip.toFixed(2)}). Downside momentum toward Put Wall (${levels.put_wall.toFixed(2)}).`;
  } else if (spot >= levels.gamma_flip) {
    zoneTitle = 'Above Gamma Flip (Stabilizing)';
    zoneBias = 'bullish';
    zoneDetail = `Price is above Gamma Flip (${levels.gamma_flip.toFixed(2)}). Look for Bull Trigger (${levels.bull_trigger.toFixed(2)}) reclaim to confirm upside.`;
  } else {
    zoneTitle = 'Below Gamma Flip (Volatile)';
    zoneBias = 'bearish';
    zoneDetail = `Price is below Gamma Flip (${levels.gamma_flip.toFixed(2)}). Expect wider swings; watch Bear Trigger (${levels.bear_trigger.toFixed(2)}) for continuation.`;
  }

  // Pin risk: check if any top strike or wall is within 0.25% of spot
  const magnetCandidates = levels.strikes
    .filter((s) => Math.abs(s.gex) > 0)
    .map((s) => ({
      strike: s.strike,
      percentAway: Math.abs(pctDiff(s.strike, spot)),
      gexM: Number((s.gex / 1_000_000).toFixed(2)),
      absGex: Math.abs(s.gex),
    }))
    .filter((c) => c.percentAway <= 0.35)
    .sort((a, b) => b.absGex - a.absGex);

  const pinTarget = magnetCandidates.length > 0
    ? {
        strike: magnetCandidates[0].strike,
        percentAway: Number(magnetCandidates[0].percentAway.toFixed(2)),
        gexM: magnetCandidates[0].gexM,
      }
    : null;

  const resistanceCandidates = levels.strikes
    .filter((s) => s.strike > spot && s.gex > 0)
    .sort((a, b) => a.strike - b.strike);
  const nearestResistance = resistanceCandidates.length > 0
    ? {
        strike: resistanceCandidates[0].strike,
        gexM: Number((resistanceCandidates[0].gex / 1_000_000).toFixed(2)),
        pointsAway: Number((resistanceCandidates[0].strike - spot).toFixed(2)),
      }
    : null;

  const supportCandidates = levels.strikes
    .filter((s) => s.strike < spot && s.gex < 0)
    .sort((a, b) => b.strike - a.strike);
  const nearestSupport = supportCandidates.length > 0
    ? {
        strike: supportCandidates[0].strike,
        gexM: Number((supportCandidates[0].gex / 1_000_000).toFixed(2)),
        pointsAway: Number((spot - supportCandidates[0].strike).toFixed(2)),
      }
    : null;

  const rawLevels: Array<{ label: string; price: number; role: LevelDistance['role'] }> = [
    { label: 'Call Wall', price: levels.call_wall, role: 'resistance' },
    { label: 'Bull Trigger', price: levels.bull_trigger, role: 'trigger' },
    { label: 'Gamma Flip', price: levels.gamma_flip, role: 'pivot' },
    { label: 'Bear Trigger', price: levels.bear_trigger, role: 'trigger' },
    { label: 'Put Wall', price: levels.put_wall, role: 'support' },
  ];

  const distances: LevelDistance[] = rawLevels
    .map((item) => ({
      ...item,
      points: Number((item.price - spot).toFixed(2)),
      percent: Number(pctDiff(item.price, spot).toFixed(2)),
    }))
    .sort((a, b) => b.price - a.price);

  const impliedRangePct = spot > 0
    ? Number((((levels.call_wall - levels.put_wall) / spot) * 100).toFixed(2))
    : 0;

  return {
    spot,
    regime,
    regimeSummary,
    zoneTitle,
    zoneBias,
    zoneDetail,
    pinTarget,
    nearestResistance,
    nearestSupport,
    distances,
    impliedRangePct,
  };
}

