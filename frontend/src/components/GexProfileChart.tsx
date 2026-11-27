import { useMemo } from 'react';
import type { GEXLevels } from '../types/gex';

interface GexProfileChartProps {
  levels: GEXLevels | null;
  livePrice?: number;
}

export function GexProfileChart({ levels, livePrice }: GexProfileChartProps) {
  const spot = livePrice && livePrice > 0 ? livePrice : levels?.underlying_price ?? 0;

  const { visibleStrikes, maxAbsGex } = useMemo(() => {
    if (!levels || levels.strikes.length === 0) {
      return { visibleStrikes: [], maxAbsGex: 1 };
    }

    // Focus on strikes nearest spot (top 22 strikes around spot) so the profile stays legible
    const sorted = [...levels.strikes].sort((a, b) => b.strike - a.strike);
    let sliced = sorted;
    if (sorted.length > 24 && spot > 0) {
      const byDist = [...sorted]
        .map((s) => ({ s, dist: Math.abs(s.strike - spot) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 24)
        .map((x) => x.s)
        .sort((a, b) => b.strike - a.strike);
      sliced = byDist;
    }

    const maxVal = Math.max(
      1,
      ...sliced.map((s) => Math.abs(s.net_gex || s.gex || 0))
    );

    return { visibleStrikes: sliced, maxAbsGex: maxVal };
  }, [levels, spot]);

  const closestStrike = useMemo(() => {
    if (!visibleStrikes.length || !spot) return null;
    return visibleStrikes.reduce((best, curr) =>
      Math.abs(curr.strike - spot) < Math.abs(best.strike - spot) ? curr : best
    ).strike;
  }, [visibleStrikes, spot]);

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Strike GEX Profile</span>
        <span className="panel-sub">
          {levels ? `${visibleStrikes.length} strikes · Net ${(levels.total_net_gex / 1_000_000).toFixed(2)}M` : '—'}
        </span>
      </div>

      <div className="scroll-body">
        {!levels ? (
          <div className="panel-sub">Waiting for GEX strike data...</div>
        ) : visibleStrikes.length === 0 ? (
          <div className="panel-sub">No strike breakdown available.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {visibleStrikes.map((s) => {
              const val = s.net_gex ?? s.gex ?? 0;
              const pct = Math.min(50, (Math.abs(val) / maxAbsGex) * 50);
              const isPos = val >= 0;
              const isSpot = s.strike === closestStrike;
              const isWall = s.strike === levels.call_wall || s.strike === levels.put_wall;
              const gexM = (val / 1_000_000).toFixed(2);

              return (
                <div
                  key={s.strike}
                  className={`strike-row ${isSpot ? 'spot-row' : ''}`}
                  title={`Strike ${s.strike} | Net GEX: ${gexM}M | OI: ${s.total_open_interest ?? '—'}`}
                >
                  <span
                    style={{
                      fontWeight: isSpot || isWall ? 700 : 500,
                      color:
                        s.strike === levels.call_wall
                          ? '#10b981'
                          : s.strike === levels.put_wall
                            ? '#ef4444'
                            : isSpot
                              ? '#60a5fa'
                              : '#cbd5e1',
                    }}
                  >
                    {s.strike.toFixed(2)}
                  </span>

                  <div className="bar-track">
                    <div className="bar-center" />
                    <div
                      className={isPos ? 'bar-fill-pos' : 'bar-fill-neg'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <span
                    style={{
                      textAlign: 'right',
                      color: isPos ? '#10b981' : '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {isPos ? `+${gexM}M` : `${gexM}M`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
