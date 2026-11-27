import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { analyzeGexLevels } from '../utils/levelAnalysis';
import type { GEXLevels } from '../types/gex';

interface AnalysisPanelProps {
  levels: GEXLevels | null;
  livePrice?: number;
  tvError: string | null;
  gexError: string | null;
}

export function AnalysisPanel({ levels, livePrice, tvError, gexError }: AnalysisPanelProps) {
  const [copied, setCopied] = useState(false);

  const analysis = levels ? analyzeGexLevels(levels, livePrice) : null;

  const handleCopyPlan = async () => {
    if (!levels?.gex_pro_text) return;
    try {
      await navigator.clipboard.writeText(levels.gex_pro_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in non-HTTPS contexts
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Level Analysis</span>
        {levels && (
          <button type="button" className="copy-btn" onClick={handleCopyPlan}>
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy Pro Plan'}
          </button>
        )}
      </div>

      <div className="scroll-body">
        {tvError && <div className="error-banner">TV Feed: {tvError}</div>}
        {gexError && <div className="error-banner">GEX Engine: {gexError}</div>}

        {!analysis || !levels ? (
          <div className="panel-sub">Loading GEX level analysis...</div>
        ) : (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-label">Spot / Live</div>
                <div className="metric-value">{analysis.spot.toFixed(2)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Gamma Regime</div>
                <div
                  className="metric-value"
                  style={{
                    color: analysis.regime === 'POSITIVE_GAMMA' ? '#10b981' : '#ef4444',
                    fontSize: '13px',
                  }}
                >
                  {analysis.regime === 'POSITIVE_GAMMA' ? '+GAMMA (Pin)' : '-GAMMA (Vol)'}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">CW–PW Range</div>
                <div className="metric-value">{analysis.impliedRangePct}%</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Net GEX</div>
                <div
                  className="metric-value"
                  style={{ color: levels.total_net_gex >= 0 ? '#10b981' : '#ef4444' }}
                >
                  {(levels.total_net_gex / 1_000_000).toFixed(2)}M
                </div>
              </div>
            </div>

            <div className={`signal-box ${analysis.zoneBias}`}>
              <div className="signal-title">{analysis.zoneTitle}</div>
              <div className="signal-desc">{analysis.zoneDetail}</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Dealer Hedging Regime</div>
              <div className="signal-desc" style={{ color: '#cbd5e1' }}>
                {analysis.regimeSummary}
              </div>
            </div>

            {analysis.pinTarget && (
              <div className="signal-box pin">
                <div className="signal-title">
                  Pin Magnet Near {analysis.pinTarget.strike.toFixed(2)}
                </div>
                <div className="signal-desc">
                  Spot is {analysis.pinTarget.percentAway}% away from a{' '}
                  {analysis.pinTarget.gexM >= 0 ? '+' : ''}
                  {analysis.pinTarget.gexM}M GEX strike.
                </div>
              </div>
            )}

            <div>
              <div className="metric-label" style={{ marginBottom: '6px' }}>
                Key Level Ladder (vs Spot)
              </div>
              <table className="level-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Price</th>
                    <th>Dist (pts)</th>
                    <th>Dist (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.distances.map((d) => {
                    const color =
                      d.role === 'resistance'
                        ? '#10b981'
                        : d.role === 'support'
                          ? '#ef4444'
                          : d.role === 'pivot'
                            ? '#f59e0b'
                            : '#06b6d4';
                    return (
                      <tr key={d.label}>
                        <td style={{ color, fontWeight: 600 }}>{d.label}</td>
                        <td>{d.price.toFixed(2)}</td>
                        <td style={{ color: d.points >= 0 ? '#10b981' : '#ef4444' }}>
                          {d.points >= 0 ? `+${d.points.toFixed(2)}` : d.points.toFixed(2)}
                        </td>
                        <td style={{ color: d.percent >= 0 ? '#10b981' : '#ef4444' }}>
                          {d.percent >= 0 ? `+${d.percent.toFixed(2)}%` : `${d.percent.toFixed(2)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-label">Next +GEX Above</div>
                <div className="metric-value" style={{ color: '#10b981', fontSize: '13px' }}>
                  {analysis.nearestResistance
                    ? `${analysis.nearestResistance.strike.toFixed(2)} (+${analysis.nearestResistance.pointsAway})`
                    : 'None'}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Next -GEX Below</div>
                <div className="metric-value" style={{ color: '#ef4444', fontSize: '13px' }}>
                  {analysis.nearestSupport
                    ? `${analysis.nearestSupport.strike.toFixed(2)} (-${analysis.nearestSupport.pointsAway})`
                    : 'None'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
