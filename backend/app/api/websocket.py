import json
import logging
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages active WebSocket connections from TradingView browser extension clients."""

    def __init__(self):
        # Map of client websocket -> set of subscribed symbols
        self.active_connections: Dict[WebSocket, Set[str]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = set(["SPY"])  # default subscription
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    def subscribe(self, websocket: WebSocket, symbol: str):
        if websocket in self.active_connections:
            self.active_connections[websocket].add(symbol.upper())

    def unsubscribe(self, websocket: WebSocket, symbol: str):
        if websocket in self.active_connections:
            self.active_connections[websocket].discard(symbol.upper())

    async def broadcast_to_symbol(self, symbol: str, message: dict):
        """Sends data payload to all clients subscribed to the given symbol."""
        sym_clean = symbol.upper()
        payload = json.dumps(message)
        dead_sockets = []

        for ws, subscriptions in self.active_connections.items():
            if sym_clean in subscriptions or "ALL" in subscriptions:
                try:
                    await ws.send_text(payload)
                except Exception as e:
                    logger.warning(f"Error sending to client: {e}")
                    dead_sockets.append(ws)

        for dead_ws in dead_sockets:
            self.disconnect(dead_ws)

ws_manager = ConnectionManager()

