import asyncio
import logging
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import router as api_router, get_levels_for_symbol
from app.api.websocket import ws_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

async def periodic_gex_broadcaster():
    """Background task to periodically broadcast updated GEX levels to subscribers."""
    while True:
        try:
            await asyncio.sleep(settings.POLL_INTERVAL_SECONDS)
            active_symbols = set()
            for subs in ws_manager.active_connections.values():
                active_symbols.update(subs)

            for sym in active_symbols:
                try:
                    levels = await get_levels_for_symbol(sym)
                    await ws_manager.broadcast_to_symbol(sym, {
                        "type": "UPDATE",
                        "data": levels.model_dump()
                    })
                except Exception as ex:
                    logger.error(f"Error updating levels for {sym}: {ex}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Broadcaster loop error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    broadcast_task = asyncio.create_task(periodic_gex_broadcaster())
    logger.info(f"GEX Backend started on http://{settings.HOST}:{settings.PORT}")
    try:
        yield
    finally:
        # Shutdown
        broadcast_task.cancel()
        try:
            await broadcast_task
        except asyncio.CancelledError:
            pass

app = FastAPI(
    title="GEX TradingView Backend Service",
    description="Automated GEX Level calculation and WebSocket streaming for TradingView",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for browser extension and local tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.websocket("/ws/gex")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                action = msg.get("action")
                symbol = msg.get("symbol", "SPY")

                if action == "subscribe":
                    ws_manager.subscribe(websocket, symbol)
                    levels = await get_levels_for_symbol(symbol)
                    await websocket.send_text(json.dumps({
                        "type": "SNAPSHOT",
                        "data": levels.model_dump()
                    }))
                elif action == "unsubscribe":
                    ws_manager.unsubscribe(websocket, symbol)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
