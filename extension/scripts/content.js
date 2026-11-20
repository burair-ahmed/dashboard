/**
 * Content Script:
 * Bridges the TradingView page DOM with extension background worker and injected script.
 */

// 1. Inject injected.js into the page context (MAIN world) to access window.TradingViewApi
function injectPageScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scripts/injected.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  console.log("[GEX Content] Injected page engine script into TradingView context.");
}

injectPageScript();

// 2. Create Floating UI Status Badge
let badgeElement = null;

function createStatusBadge() {
  if (document.getElementById("gex-status-badge")) return;

  badgeElement = document.createElement("div");
  badgeElement.id = "gex-status-badge";
  badgeElement.className = "gex-floating-badge";
  badgeElement.innerHTML = `
    <div class="gex-badge-header">
      <span class="gex-status-dot"></span>
      <span class="gex-title">GEX Automation</span>
      <span class="gex-copy-btn" title="Copy Pine Script Input String">📋</span>
    </div>
    <div class="gex-badge-body">
      <div class="gex-stat"><span class="gex-lbl">CW:</span> <span id="gex-cw">--</span></div>
      <div class="gex-stat"><span class="gex-lbl">PW:</span> <span id="gex-pw">--</span></div>
      <div class="gex-stat"><span class="gex-lbl">GF:</span> <span id="gex-gf">--</span></div>
    </div>
    <div class="gex-badge-footer">
      <span id="gex-symbol">--</span> • <span id="gex-age">Connecting...</span>
    </div>
  `;
  document.body.appendChild(badgeElement);

  // Copy button handler
  badgeElement.querySelector(".gex-copy-btn").addEventListener("click", () => {
    if (window.__GEX_LATEST_COMPACT__) {
      navigator.clipboard.writeText(window.__GEX_LATEST_COMPACT__).then(() => {
        const btn = badgeElement.querySelector(".gex-copy-btn");
        btn.textContent = "✅";
        setTimeout(() => { btn.textContent = "📋"; }, 1500);
      });
    }
  });
}

createStatusBadge();

// 3. Monitor Active Symbol Changes in TradingView UI
let lastDetectedSymbol = "";

function detectSymbol() {
  // Common TradingView header selectors
  const symbolSelectors = [
    '[id*="header-toolbar-symbol-search"] button div',
    '[class*="symbolEdit-"]',
    '[data-name="legend-series-item"]'
  ];

  for (const selector of symbolSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      const sym = el.textContent.trim();
      if (sym && sym !== lastDetectedSymbol && !sym.includes("+") && sym.length < 25) {
        lastDetectedSymbol = sym;
        console.log("[GEX Content] Active symbol change detected:", sym);
        chrome.runtime.sendMessage({ action: "SYMBOL_CHANGED", symbol: sym });
        break;
      }
    }
  }
}

// Observe DOM changes to track symbol switches
const observer = new MutationObserver(() => {
  detectSymbol();
});
observer.observe(document.body, { childList: true, subtree: true });
setInterval(detectSymbol, 2000);

// 4. Relay Levels from Extension to Injected Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "NEW_GEX_LEVELS") {
    const levels = request.payload;
    window.__GEX_LATEST_COMPACT__ = levels.compact_string;

    // Update Badge
    if (badgeElement) {
      const dot = badgeElement.querySelector(".gex-status-dot");
      dot.className = "gex-status-dot connected";
      document.getElementById("gex-cw").textContent = levels.call_wall;
      document.getElementById("gex-pw").textContent = levels.put_wall;
      document.getElementById("gex-gf").textContent = levels.gamma_flip;
      document.getElementById("gex-symbol").textContent = levels.target_symbol || levels.symbol;
      document.getElementById("gex-age").textContent = new Date().toLocaleTimeString();
    }

    // Post message to page window for injected.js to execute TradingView chart drawings
    window.postMessage({
      type: "RENDER_GEX_LEVELS",
      levels: levels
    }, "*");

    sendResponse({ received: true });
  }
});

