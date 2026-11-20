/**
 * Background Service Worker:
 * Manages WebSocket connection + REST polling fallback to backend
 * (Local or Hugging Face Spaces cloud).
 * Relays live level broadcasts to active TradingView tabs.
 */

const CLOUD_BACKEND = "https://burair-ahmed-gex-backend.hf.space";
const LOCAL_BACKEND = "http://127.0.0.1:7860";

let socket = null;
let currentSymbol = "SPY";
let isConnected = false;
let reconnectTimer = null;
let pollTimer = null;
let lastLevels = null;
let backendHttpUrl = CLOUD_BACKEND; // Default to cloud
let wsConsecutiveFailures = 0;
let usePolling = false;

function getWsUrl(httpUrl) {
  const clean = httpUrl.trim().replace(/\/+$/, "");
  if (clean.startsWith("https://")) {
    return clean.replace(/^https:\/\//, "wss://") + "/ws/gex";
  } else if (clean.startsWith("http://")) {
    return clean.replace(/^http:\/\//, "ws://") + "/ws/gex";
  }
  if (clean.includes("hf.space")) {
    return "wss://" + clean + "/ws/gex";
  }
  return "ws://" + clean + "/ws/gex";
}

function getRestUrl(httpUrl, symbol) {
  const clean = httpUrl.trim().replace(/\/+$/, "");
  return `${clean}/api/levels/${encodeURIComponent(symbol)}`;
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {}
}

function broadcastLevels(levels) {
  lastLevels = levels;
  chrome.storage.local.set({ gex_last_levels: lastLevels, gex_connected: true });

  chrome.tabs.query({ url: "*://*.tradingview.com/chart/*" }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        action: "NEW_GEX_LEVELS",
        payload: lastLevels
      }).catch(() => {});
    });
  });
}

// ═══════════════════════════════════════════
// WebSocket Connection
// ═══════════════════════════════════════════
function connectWebSocket() {
  chrome.storage.local.get(["backend_url"], (res) => {
    if (res.backend_url) {
      backendHttpUrl = res.backend_url;
    }

    const wsUrl = getWsUrl(backendHttpUrl);

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log("[GEX BG] Connecting WS:", wsUrl);
    setBadge("...", "#FF9100");

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        isConnected = true;
        wsConsecutiveFailures = 0;
        usePolling = false;
        stopPolling();
        console.log("[GEX BG] WebSocket connected to", wsUrl);
        setBadge("WS", "#00E676");
        sendSubscription(currentSymbol);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "SNAPSHOT" || msg.type === "UPDATE") {
            broadcastLevels(msg.data);
          }
        } catch (err) {
          console.error("[GEX BG] Error parsing WS message:", err);
        }
      };

      socket.onclose = () => {
        isConnected = false;
        wsConsecutiveFailures++;
        chrome.storage.local.set({ gex_connected: false });

        // After 3 consecutive WS failures, switch to REST polling
        if (wsConsecutiveFailures >= 3) {
          console.warn("[GEX BG] WS failed 3 times, switching to REST polling.");
          usePolling = true;
          setBadge("API", "#2962FF");
          startPolling();
        } else {
          setBadge("OFF", "#FF1744");
          scheduleReconnect();
        }
      };

      socket.onerror = (err) => {
        console.warn("[GEX BG] WebSocket error:", err);
        socket.close();
      };
    } catch (err) {
      console.error("[GEX BG] Failed to create WebSocket:", err);
      wsConsecutiveFailures++;
      if (wsConsecutiveFailures >= 3) {
        usePolling = true;
        setBadge("API", "#2962FF");
        startPolling();
      } else {
        scheduleReconnect();
      }
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  // Exponential backoff: 3s, 6s, 12s (then polling takes over)
  const delay = Math.min(3000 * Math.pow(2, wsConsecutiveFailures - 1), 12000);
  reconnectTimer = setTimeout(connectWebSocket, delay);
}

function sendSubscription(symbol) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    currentSymbol = symbol;
    socket.send(JSON.stringify({ action: "subscribe", symbol: symbol }));
    console.log("[GEX BG] Subscribed to symbol:", symbol);
  }
}

// ═══════════════════════════════════════════
// REST Polling Fallback
// ═══════════════════════════════════════════
async function pollRestOnce() {
  try {
    const url = getRestUrl(backendHttpUrl, currentSymbol);
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    broadcastLevels(data);
    isConnected = true;
    setBadge("API", "#2962FF");
  } catch (err) {
    console.warn("[GEX BG] REST poll error:", err.message);
    isConnected = false;
    setBadge("OFF", "#FF1744");
  }
}

function startPolling() {
  stopPolling();
  console.log("[GEX BG] Starting REST polling every 10s");
  pollRestOnce(); // immediate first fetch
  pollTimer = setInterval(pollRestOnce, 10000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Periodically try to reconnect WS even when polling
setInterval(() => {
  if (usePolling) {
    console.log("[GEX BG] Attempting WS reconnect from polling mode...");
    wsConsecutiveFailures = 0;
    usePolling = false;
    stopPolling();
    connectWebSocket();
  }
}, 120000); // Try WS again every 2 minutes

// ═══════════════════════════════════════════
// Message Handler
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYMBOL_CHANGED") {
    currentSymbol = request.symbol;
    if (usePolling) {
      pollRestOnce();
    } else {
      sendSubscription(currentSymbol);
    }
    sendResponse({ status: "ok" });
  } else if (request.action === "GET_STATUS") {
    sendResponse({
      connected: isConnected,
      currentSymbol: currentSymbol,
      backendUrl: backendHttpUrl,
      lastLevels: lastLevels,
      mode: usePolling ? "REST Polling" : (isConnected ? "WebSocket" : "Reconnecting")
    });
  } else if (request.action === "UPDATE_BACKEND_URL") {
    backendHttpUrl = request.url;
    wsConsecutiveFailures = 0;
    usePolling = false;
    stopPolling();
    chrome.storage.local.set({ backend_url: backendHttpUrl }, () => {
      if (socket) socket.close();
      connectWebSocket();
      sendResponse({ status: "reconnecting", url: backendHttpUrl });
    });
  } else if (request.action === "RECONNECT_WS") {
    wsConsecutiveFailures = 0;
    usePolling = false;
    stopPolling();
    if (socket) socket.close();
    connectWebSocket();
    sendResponse({ status: "reconnecting" });
  }
  return true;
});

// Initial startup
connectWebSocket();
