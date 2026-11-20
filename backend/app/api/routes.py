from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from app.services.itmatrix_client import ITMatrixClient
from app.services.symbol_map import SymbolMapper
from app.services.gex_processor import GEXProcessor, GEXLevels
from app.core.basis import BasisConverter

router = APIRouter()
itmatrix_client = ITMatrixClient()

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "GEX TradingView Backend"
    }

@router.get("/api/symbols")
async def list_supported_symbols():
    return {
        "symbols": list(SymbolMapper.MAPPING.keys())
    }

@router.get("/api/levels/{tv_symbol}", response_model=GEXLevels)
async def get_levels_for_symbol(tv_symbol: str):
    """
    Computes GEX levels adjusted for the requested TradingView ticker symbol.
    """
    underlying = SymbolMapper.resolve_underlying(tv_symbol)
    raw_data = await itmatrix_client.get_raw_gex(underlying)
    
    timestamp = datetime.now(timezone.utc).isoformat()
    levels = GEXProcessor.process_raw_data(
        symbol=underlying,
        target_symbol=tv_symbol,
        data=raw_data,
        timestamp=timestamp
    )

    # Convert levels if target symbol is futures or has a basis difference
    if underlying != tv_symbol.upper():
        levels.call_wall = BasisConverter.convert_level_to_target(levels.call_wall, underlying, tv_symbol)
        levels.put_wall = BasisConverter.convert_level_to_target(levels.put_wall, underlying, tv_symbol)
        levels.gamma_flip = BasisConverter.convert_level_to_target(levels.gamma_flip, underlying, tv_symbol)
        levels.top_positive_strikes = [
            BasisConverter.convert_level_to_target(s, underlying, tv_symbol) for s in levels.top_positive_strikes
        ]
        levels.top_negative_strikes = [
            BasisConverter.convert_level_to_target(s, underlying, tv_symbol) for s in levels.top_negative_strikes
        ]
        # Update compact string with converted values
        levels.compact_string = (
            f"CW:{levels.call_wall:.2f}|PW:{levels.put_wall:.2f}|GF:{levels.gamma_flip:.2f}|"
            f"R:{'POS' if levels.total_net_gex >= 0 else 'NEG'}"
        )

    return levels

@router.get("/api/compact/{tv_symbol}")
async def get_compact_string(tv_symbol: str):
    """Returns just the compact Pine script string for fast clipboard copy."""
    levels = await get_levels_for_symbol(tv_symbol)
    return {
        "symbol": tv_symbol,
        "compact_string": levels.compact_string
    }

