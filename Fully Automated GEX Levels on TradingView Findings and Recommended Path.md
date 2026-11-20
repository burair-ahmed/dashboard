# Fully Automated GEX Levels on TradingView: Findings and Recommended Path

*Brainstorm summary, prepared November 19, 2026, for the Sniper Reversal Engine project (to be built on Google Antigravity)*

## Bottom line

Full automation with no interruption is possible, but not by feeding the Pine indicator. The best route is a browser extension that draws the GEX levels directly on the TradingView chart as native drawings, fed by your own backend that pulls the ITMatrixHQ API.

## What was ruled out

- **`request.seed()` (Pine Seeds):** This is the one built-in way to bring outside data into Pine. TradingView's docs say creating new Pine Seeds repositories is currently unavailable. Even for existing repos, the data is end-of-day data that can only be updated a few times per day and only works on daily timeframes and above. It is useless for intraday levels.
- **Pine making HTTP calls:** Pine's `request.*` family covers things like economic data, financials, footprint data and seeds. Nothing in the docs lets a script call an arbitrary URL.
- **Settings auto-fill:** Extensions such as GEXPluto Auto-Sync open the indicator's settings dialog and type the levels into the input fields. That flashes a dialog on screen, so it fails the zero-interruption requirement.

## The recommended path: native lines drawn through TradingView's internal chart interface

TradingView's own chart exposes a drawing interface in the page. The official Charting Library documentation describes it: `createShape` creates drawings such as horizontal lines from a price and a shape name. A public gist from 2023 shows the same idea working on the regular TradingView site from the browser console. It obtains `window.TradingViewApi.activeChart()` and creates a horizontal ray at a given price through the chart model.

### Design

1. **Backend** pulls ITMatrixHQ GEX data, computes the final levels (call wall, put wall, gamma flip, top strikes), applies symbol mapping and pushes the levels over WebSocket.
2. **Extension** runs a script inside the TradingView page that receives the levels and creates or moves native horizontal lines through the internal interface. No dialog opens and nothing steals focus.
3. **Updates move the existing lines** by ID instead of redrawing them, and the lines are re-applied when you switch symbol or timeframe.

Because the lines are native TradingView drawings, they scroll and zoom correctly and can be styled. They may also be usable for TradingView's own crossing alerts (unverified).

### Risks

- **The internal interface is undocumented.** The gist is from 2023 and uses private objects (`_chartWidget`, `_model`). TradingView can break it at any update, and it has not been verified against the current site.
- **Unconfirmed competitor mechanisms.** It was not possible to confirm how GEXRadar or QuantWheel draw. QuantWheel's pinned bar chart is redrawn on scroll and zoom, which suggests a canvas overlay, but that is an inference.
- **Terms of use are unverified.** TradingView's terms on automating its UI have not been checked. A related open-source tool warns that programmatic consumption of TradingView data may conflict with the terms. That warning is about reading data, not drawing, but the terms should be read before building a product on this.
- **Pine cannot see these lines.** Sniper Reversal Engine's logic cannot use the GEX lines in its confluence rules, because drawings are separate from Pine.

### Fallback layers

Build the extension in layers so a TradingView update never leaves you with nothing:

1. Native lines through the internal interface (best).
2. A canvas overlay drawn over the chart.
3. A paste string for the Pine indicator.

## How existing GEX products work

| Product | Method |
| --- | --- |
| GEXPluto Auto-Sync | Extension opens the Pine indicator's settings dialog and fills the inputs from your API. Falls back to clipboard copy if TradingView's page structure changes. |
| HS Plotter GEX | Extension scrapes levels from a third-party site and plots them with a Pine indicator. The exact hand-off mechanism is not stated. |
| GEXRadar | Extension overlays walls, gamma flip and other strikes, converts ETF gamma levels to futures prices (QQQ/SPY to NQ/ES), uses Yahoo Finance for live prices, and offers a data-string export for its Pine indicator as a fallback. |
| QuantWheel | Extension draws on the chart with no Pine script needed, and redraws when you scroll and zoom. |

## Two other full-automation routes

- **TradingView Desktop via debug port.** A local service controls the desktop app over Chrome DevTools Protocol, with no extension. An open-source project does this and can draw trend lines, horizontal lines, rectangles and text, and read price levels from Pine indicators. TradingView Desktop must be launched with a debug flag each time. The same terms caveat applies.
- **Your own chart in the browser** (Lightweight Charts, or the licensed Advanced Charts library, which has the same drawing API). It is fully automated and carries no terms risk, but it is a separate chart and does not run Pine, so Sniper Reversal Engine would have to be rewritten.

## Data issues to settle early

- **Symbol mapping.** The API gives GEX per listed symbol (SPY, QQQ, GLD, SLV), but the trading instruments are NAS, SPX and Gold/Silver. That requires ratio conversion and, for futures, a live basis adjustment. Check whether the ITMatrixHQ registry has SPX and NDX directly.
- **Units.** Strikes arrive as integer thousandths of a dollar, GEX is dollars of dealer hedging per $1 move, and `flip_point` can be `null`, so the app needs a fallback.
- **Key security.** The API key stays on the server only, never in the extension or the indicator.
- **Entitlements and limits.** The API tier's rate limits, caching, and the market-data classification declaration affect polling frequency. The data terms likely do not allow redistribution, so keep this private.

## Recommended roadmap

| Phase | Goal |
| --- | --- |
| 0. Feasibility test | In the TradingView browser console, check that `window.TradingViewApi.activeChart()` exists on the current site, that it can create and move a horizontal line, and whether it can set indicator inputs silently. Silent input setting, if available, would let the extension update the Pine indicator invisibly and keep the confluence logic. This is unconfirmed. |
| 1. Backend | Pull ITMatrixHQ GEX, compute final levels, apply symbol mapping, serve levels over WebSocket. Also export a compact level string for a paste-in Pine indicator. |
| 2. Extension | Native-line drawing with the overlay and paste-string fallbacks, symbol and timeframe change handling, and a small status badge showing level age. |
| 3. Optional dashboard | Web app with heatmaps and a live GEX view, since Pine cannot draw heatmaps. |

## Open decisions

- Whether to chart ETFs only (one data source, no basis conversion) or the actual futures and spot instruments (needs a second price provider).
- Whether to run the Phase 0 console test first.
- Confirmation of TradingView's terms of use for automation.

## Sources consulted

- TradingView Pine Script docs, Other timeframes and data (request.seed notices): tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- Pine Seeds documentation: github.com/tradingview-pine-seeds/docs
- TradingView Charting Library docs, Drawings API: tradingview.com/charting-library-docs/latest/ui\_elements/drawings/drawings-api/
- Public gist on creating a horizontal ray via `window.TradingViewApi`: gist.github.com/episage/0293682a0f33d2da7e43be3edcf3f52a
- GEXPluto Auto-Sync, GEXRadar and QuantWheel product pages (Chrome Web Store and vendor sites)
- Open-source TradingView desktop bridge: github.com/mnroptions/tradingview-mcp
