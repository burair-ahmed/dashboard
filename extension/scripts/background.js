/**
 * Background Service Worker:
 * Manages WebSocket connection to backend service at ws://127.0.0.1:8765/ws/gex
 * Relays live level broadcasts to active TradingView tabs.
 */

let socket = null;
let currentSymbol = "SPY";
let isConnected = false;
let reconnectTimer = null;
let lastLevels = null;

const WS_URL = "ws://127.0.0.1:8765/ws/gex";

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    // Ignore in non-tab contexts
  }
}

function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log("[GEX BG] Connecting to backend at", WS_URL);
  setBadge("...", "#FF9100");

  try {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      isConnected = true;
      console.log("[GEX BG] WebSocket connected successfully");
      setBadge("ON", "#00E676");
      // Subscribe to active symbol
      sendSubscription(currentSymbol);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "SNAPSHOT" || msg.type === "UPDATE") {
          lastLevels = msg.data;
          // Store in chrome storage for popup access
          chrome.storage.local.set({ gex_last_levels: lastLevels, gex_connected: true });
          
          // Broadcast to all TradingView tabs
          chrome.tabs.query({ url: "*://*.tradingview.com/chart/*" }, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs.sendMessage(tab.id, {
                action: "NEW_GEX_LEVELS",
                payload: lastLevels
              }).catch(() => {});
            });
          });
        }
      } catch (err) {
        console.error("[GEX BG] Error parsing WS message:", err);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      setBadge("OFF", "#FF1744");
      chrome.storage.local.set({ gex_connected: false });
      console.warn("[GEX BG] WebSocket closed. Reconnecting in 3s...");
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      console.warn("[GEX BG] WebSocket error:", err);
      socket.close();
    };
  } catch (err) {
    console.error("[GEX BG] Failed to create WebSocket:", err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWebSocket, 3000);
}

function sendSubscription(symbol) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    currentSymbol = symbol;
    socket.send(JSON.stringify({ action: "subscribe", symbol: symbol }));
    console.log("[GEX BG] Subscribed to symbol:", symbol);
  }
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYMBOL_CHANGED") {
    currentSymbol = request.symbol;
    sendSubscription(currentSymbol);
    sendResponse({ status: "ok" });
  } else if (request.action === "GET_STATUS") {
    sendResponse({
      connected: isConnected,
      currentSymbol: currentSymbol,
      lastLevels: lastLevels
    });
  } else if (request.action === "RECONNECT_WS") {
    connectWebSocket();
    sendResponse({ status: "reconnecting" });
  }
  return true;
});

// Initial connection
connectWebSocket();

