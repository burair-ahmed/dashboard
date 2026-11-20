import pytest
from app.services.symbol_map import SymbolMapper

def test_resolve_underlying():
    assert SymbolMapper.resolve_underlying("SPY") == "SPY"
    assert SymbolMapper.resolve_underlying("AMEX:SPY") == "SPY"
    assert SymbolMapper.resolve_underlying("CME_MINI:ES1!") == "SPY"
    assert SymbolMapper.resolve_underlying("ES1!") == "SPY"
    assert SymbolMapper.resolve_underlying("QQQ") == "QQQ"
    assert SymbolMapper.resolve_underlying("CME_MINI:NQ1!") == "QQQ"
    assert SymbolMapper.resolve_underlying("GC1!") == "GLD"
    assert SymbolMapper.resolve_underlying("XAUUSD") == "GLD"

