from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from app.services.itmatrix_client import ITMatrixClient
from app.services.symbol_map import SymbolMapper
from app.services.gex_processor import GEXProcessor, GEXLevels
from app.core.basis import BasisConverter

router = APIRouter()
itmatrix_client = ITMatrixClient()

def _convert_gex_pro_text(text: str, source_sym: str, target_sym: str) -> str:
    """Scales price numbers in GEX Levels Pro text for futures/indices."""
    if source_sym.upper() == target_sym.upper():
        return text

    converted_lines = []
    for line in text.split("\n"):
        parts = line.split("|")
        if not parts or not parts[0].strip():
            continue

        key = parts[0].strip()
        # Metadata lines:
        if key == "HV" and len(parts) >= 2:
            try:
                p = float(parts[1])
                conv_p = BasisConverter.convert_level_to_target(p, source_sym, target_sym)
                converted_lines.append(f"HV|{conv_p}")
            except ValueError:
                converted_lines.append(line)
        elif key == "REJ" and len(parts) >= 3:
            try:
                r1 = float(parts[1])
                r2 = float(parts[2])
                c1 = BasisConverter.convert_level_to_target(r1, source_sym, target_sym)
                c2 = BasisConverter.convert_level_to_target(r2, source_sym, target_sym)
                converted_lines.append(f"REJ|{c1}|{c2}")
            except ValueError:
                converted_lines.append(line)
        elif key == "NET":
            converted_lines.append(line)
        else:
            # Regular strike line: price|type|gex|desc
            try:
                price = float(key)
                conv_price = BasisConverter.convert_level_to_target(price, source_sym, target_sym)
                parts[0] = str(conv_price)
                converted_lines.append("|".join(parts))
            except ValueError:
                converted_lines.append(line)

    return "\n".join(converted_lines)

@router.get("/health")
@router.get("/api/health")
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
    Includes both native levels and complete GEX Levels Pro formatted plan.
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
        levels.underlying_price = BasisConverter.convert_level_to_target(levels.underlying_price, underlying, tv_symbol)
        levels.call_wall = BasisConverter.convert_level_to_target(levels.call_wall, underlying, tv_symbol)
        levels.put_wall = BasisConverter.convert_level_to_target(levels.put_wall, underlying, tv_symbol)
        levels.gamma_flip = BasisConverter.convert_level_to_target(levels.gamma_flip, underlying, tv_symbol)
        levels.bull_trigger = BasisConverter.convert_level_to_target(levels.bull_trigger, underlying, tv_symbol)
        levels.bear_trigger = BasisConverter.convert_level_to_target(levels.bear_trigger, underlying, tv_symbol)
        levels.top_positive_strikes = [
            BasisConverter.convert_level_to_target(s, underlying, tv_symbol) for s in levels.top_positive_strikes
        ]
        levels.top_negative_strikes = [
            BasisConverter.convert_level_to_target(s, underlying, tv_symbol) for s in levels.top_negative_strikes
        ]
        for s in levels.strikes:
            s.strike = BasisConverter.convert_level_to_target(s.strike, underlying, tv_symbol)
        levels.compact_string = (
            f"CW:{levels.call_wall:.2f}|PW:{levels.put_wall:.2f}|GF:{levels.gamma_flip:.2f}|"
            f"R:{'POS' if levels.total_net_gex >= 0 else 'NEG'}"
        )
        levels.gex_pro_text = _convert_gex_pro_text(levels.gex_pro_text, underlying, tv_symbol)

    return levels

@router.get("/api/compact/{tv_symbol}")
async def get_compact_string(tv_symbol: str):
    """Returns compact Pine script string for fast clipboard copy."""
    levels = await get_levels_for_symbol(tv_symbol)
    return {
        "symbol": tv_symbol,
        "compact_string": levels.compact_string
    }

@router.get("/api/gex-pro-plan/{tv_symbol}", response_class=PlainTextResponse)
async def get_gex_pro_plan(tv_symbol: str):
    """Returns exact multi-line text for GEX Levels Pro indicator."""
    levels = await get_levels_for_symbol(tv_symbol)
    return levels.gex_pro_text
