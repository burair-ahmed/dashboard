/**
 * Content Script:
 * Bridges TradingView DOM with extension background worker and injected page script.
 */

function injectPageScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scripts/injected.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  console.log("[GEX Content] Injected page engine script into TradingView context.");
}

injectPageScript();

let badgeElement = null;
let latestGexProText = "";
let latestCompactString = "";
let isGexProSynced = false;

function createStatusBadge() {
  if (document.getElementById("gex-status-badge")) return;

  badgeElement = document.createElement("div");
  badgeElement.id = "gex-status-badge";
  badgeElement.className = "gex-floating-badge";
  badgeElement.innerHTML = `
    <div class="gex-badge-header">
      <span class="gex-status-dot"></span>
      <span class="gex-title">GEX Automation</span>
      <span class="gex-sync-pill" id="gex-pro-status">Syncing...</span>
      <span class="gex-copy-btn" id="gex-copy-pro" title="Copy GEX Pro Plan to Clipboard">📋</span>
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

  // Copy GEX Pro Plan handler
  badgeElement.querySelector("#gex-copy-pro").addEventListener("click", () => {
    const textToCopy = latestGexProText || latestCompactString;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = badgeElement.querySelector("#gex-copy-pro");
        btn.textContent = "✅";
        setTimeout(() => { btn.textContent = "📋"; }, 1500);
      });
    }
  });
}

createStatusBadge();

// Detect active symbol changes in TradingView
let lastDetectedSymbol = "";

function detectSymbol() {
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

const observer = new MutationObserver(() => { detectSymbol(); });
observer.observe(document.body, { childList: true, subtree: true });
setInterval(detectSymbol, 2000);

// Listen for messages from injected page world
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === "GEX_PRO_SYNC_STATUS") {
    isGexProSynced = event.data.synced;
    const pill = document.getElementById("gex-pro-status");
    if (pill) {
      if (isGexProSynced) {
        pill.textContent = "GEX Pro Synced";
        pill.className = "gex-sync-pill synced";
      } else {
        pill.textContent = "Native Lines";
        pill.className = "gex-sync-pill native";
      }
    }
  }
});

// Relay Levels from background to injected script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "NEW_GEX_LEVELS") {
    const levels = request.payload;
    latestCompactString = levels.compact_string;
    latestGexProText = levels.gex_pro_text;

    // Update Badge UI
    if (badgeElement) {
      const dot = badgeElement.querySelector(".gex-status-dot");
      dot.className = "gex-status-dot connected";
      document.getElementById("gex-cw").textContent = levels.call_wall;
      document.getElementById("gex-pw").textContent = levels.put_wall;
      document.getElementById("gex-gf").textContent = levels.gamma_flip;
      document.getElementById("gex-symbol").textContent = levels.target_symbol || levels.symbol;
      document.getElementById("gex-age").textContent = new Date().toLocaleTimeString();
    }

    // Send to injected.js
    window.postMessage({
      type: "RENDER_GEX_LEVELS",
      levels: levels
    }, "*");

    sendResponse({ received: true });
  }
});
