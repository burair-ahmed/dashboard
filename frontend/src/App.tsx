import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { CandlestickChart } from './components/CandlestickChart';
import { GexProfileChart } from './components/GexProfileChart';
import { AnalysisPanel } from './components/AnalysisPanel';
import { useMarketData } from './hooks/useMarketData';
import { useGexLevels } from './hooks/useGexLevels';
import type { OverlayVisibility } from './types/gex';

export function App() {
  const [symbol, setSymbol] = useState<string>('SPY');
  const [timeframe, setTimeframe] = useState<string>('5');
  const [visibility, setVisibility] = useState<OverlayVisibility>({
    walls: true,
    gammaFlip: true,
    triggers: true,
    secondaryStrikes: false,
  });

  const market = useMarketData(symbol, timeframe);
  const gex = useGexLevels(symbol);

  const handleToggleVisibility = (key: keyof OverlayVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const livePrice = market.latestCandle?.close;

  return (
    <div className="app-shell">
      <TopBar
        symbol={symbol}
        timeframe={timeframe}
        onSymbolChange={setSymbol}
        onTimeframeChange={setTimeframe}
        visibility={visibility}
        onToggleVisibility={handleToggleVisibility}
        tvStatus={market.status}
        gexStatus={gex.status}
        onRefreshGex={gex.refresh}
      />

      <main className="main-grid">
        <CandlestickChart
          candles={market.candles}
          latestCandle={market.latestCandle}
          levels={gex.levels}
          visibility={visibility}
          tvSymbol={market.tvSymbol}
          timeframe={timeframe}
          loading={market.loading}
        />

        <GexProfileChart levels={gex.levels} livePrice={livePrice} />

        <AnalysisPanel
          levels={gex.levels}
          livePrice={livePrice}
          tvError={market.error}
          gexError={gex.error}
        />
      </main>
    </div>
  );
}

export default App;
