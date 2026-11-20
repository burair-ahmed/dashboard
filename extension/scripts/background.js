/**
 * Background Service Worker:
 * Manages WebSocket connection to backend service (Local or Hugging Face Spaces cloud).
 * Relays live level broadcasts to active TradingView tabs.
 */

let socket = null;
let currentSymbol = "SPY";
let isConnected = false;
let reconnectTimer = null;
let lastLevels = null;
let backendHttpUrl = "http://127.0.0.1:7860";

function getWsUrl(httpUrl) {
  const clean = httpUrl.trim().replace(/\/+$/, "");
  if (clean.startsWith("https://")) {
    return clean.replace(/^https:\/\//, "wss://") + "/ws/gex";
  } else if (clean.startsWith("http://")) {
    return clean.replace(/^http:\/\//, "ws://") + "/ws/gex";
  }
  // Default to wss for cloud domains
  if (clean.includes("hf.space")) {
    return "wss://" + clean + "/ws/gex";
  }
  return "ws://" + clean + "/ws/gex";
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {}
}

function connectWebSocket() {
  chrome.storage.local.get(["backend_url"], (res) => {
    if (res.backend_url) {
      backendHttpUrl = res.backend_url;
    }

    const wsUrl = getWsUrl(backendHttpUrl);

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log("[GEX BG] Connecting to backend at", wsUrl);
    setBadge("...", "#FF9100");

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        isConnected = true;
        console.log("[GEX BG] WebSocket connected to", wsUrl);
        setBadge("ON", "#00E676");
        sendSubscription(currentSymbol);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "SNAPSHOT" || msg.type === "UPDATE") {
            lastLevels = msg.data;
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
  });
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
      backendUrl: backendHttpUrl,
      lastLevels: lastLevels
    });
  } else if (request.action === "UPDATE_BACKEND_URL") {
    backendHttpUrl = request.url;
    chrome.storage.local.set({ backend_url: backendHttpUrl }, () => {
      if (socket) {
        socket.close();
      }
      connectWebSocket();
      sendResponse({ status: "reconnecting", url: backendHttpUrl });
    });
  } else if (request.action === "RECONNECT_WS") {
    if (socket) socket.close();
    connectWebSocket();
    sendResponse({ status: "reconnecting" });
  }
  return true;
});

// Initial startup
connectWebSocket();
