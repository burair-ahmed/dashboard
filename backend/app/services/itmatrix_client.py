import httpx
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class ITMatrixClient:
    """
    Production client for interacting with ITMatrixHQ REST API v2.
    Official Docs: https://docs.itmatrixhq.com/api
    """

    def __init__(self):
        self.api_key = settings.ITMATRIX_API_KEY
        self.base_url = settings.ITMATRIX_BASE_URL.rstrip("/")
        self._cache: Dict[str, Dict[str, Any]] = {}

    async def get_raw_gex(self, symbol: str) -> Dict[str, Any]:
        """
        Fetches live GEX chain grid from ITMatrixHQ:
        Endpoint: GET /v2/gex/{symbol}/grid
        """
        symbol = symbol.upper()

        if settings.USE_MOCK_DATA or not self.api_key:
            return self._generate_mock_data(symbol)

        url = f"{self.base_url}/v2/gex/{symbol}/grid"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "User-Agent": "Antigravity-GEX-TradingView/1.0"
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    body = response.json()
                    # ITMatrixHQ wraps in {data: {...}, meta: {...}} envelope
                    data = body.get("data", {})
                    self._cache[symbol] = {
                        "data": data,
                        "fetched_at": datetime.now(timezone.utc).isoformat()
                    }
                    return data
                elif response.status_code == 403:
                    err_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    logger.warning(f"ITMatrixHQ 403 on {symbol}: {err_json}. Falling back to mock/cache.")
                    return self._fallback_data(symbol)
                else:
                    logger.error(f"ITMatrixHQ HTTP {response.status_code} on {symbol}: {response.text}")
                    return self._fallback_data(symbol)
        except Exception as e:
            logger.error(f"Failed to fetch live GEX from ITMatrixHQ for {symbol}: {e}. Falling back to cache/mock.")
            return self._fallback_data(symbol)

    def _fallback_data(self, symbol: str) -> Dict[str, Any]:
        if symbol in self._cache:
            return self._cache[symbol]["data"]
        return self._generate_mock_data(symbol)

    def _generate_mock_data(self, symbol: str) -> Dict[str, Any]:
        """Generates realistic synthetic GEX data with thousandths-of-a-dollar strikes."""
        base_prices = {
            "SPY": 585.00,
            "SPX": 5850.00,
            "QQQ": 490.00,
            "NDX": 19600.00,
            "GLD": 240.00,
            "SLV": 28.00,
        }

        center_price = base_prices.get(symbol, 500.00)
        center_raw = int(center_price * 1000)
        step_raw = int((center_price * 0.005) * 1000)

        strikes = []
        for i in range(-10, 11):
            s = center_raw + (i * step_raw)
            distance_from_center = i
            c_gex = max(0.0, 15000000.0 - (abs(distance_from_center - 2) * 2000000.0))
            p_gex = -max(0.0, 14000000.0 - (abs(distance_from_center + 2) * 2000000.0))
            strikes.append({
                "strike": s,
                "gex": c_gex + p_gex,
                "call_gex": c_gex,
                "put_gex": p_gex,
                "call_oi": int(1000 + (c_gex / 1000)),
                "put_oi": int(1000 + (abs(p_gex) / 1000))
            })

        return {
            "symbol": symbol,
            "spot": center_price,
            "underlying_price": center_price,
            "flip_point": center_price,
            "net_gex": sum(s["gex"] for s in strikes),
            "strikes": strikes,
            "source": "MOCK_SYNTHETIC"
        }
