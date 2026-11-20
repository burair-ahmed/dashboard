import pytest
from app.services.gex_processor import GEXProcessor

def test_normalize_strike():
    assert GEXProcessor.normalize_strike(5850000) == 5850.00
    assert GEXProcessor.normalize_strike(4900000) == 4900.00
    assert GEXProcessor.normalize_strike(585.50) == 585.50

def test_process_raw_data_walls_and_flip():
    sample_data = {
        "underlying_price": 5850000,
        "flip_point": 5820000,
        "strikes": [
            {"strike": 5700000, "call_gex": 10000.0, "put_gex": -900000.0, "net_gex": -890000.0},
            {"strike": 5800000, "call_gex": 200000.0, "put_gex": -200000.0, "net_gex": 0.0},
            {"strike": 5900000, "call_gex": 950000.0, "put_gex": -10000.0, "net_gex": 940000.0},
        ]
    }
    levels = GEXProcessor.process_raw_data("SPY", "SPY", sample_data, "2026-11-20T10:00:00Z")
    
    assert levels.call_wall == 5900.00
    assert levels.put_wall == 5700.00
    assert levels.gamma_flip == 5820.00
    assert levels.regime == "POSITIVE_GAMMA"
    assert "CW:5900.00|PW:5700.00|GF:5820.00" in levels.compact_string

def test_zero_crossing_fallback():
    sample_data = {
        "underlying_price": 5850000,
        "flip_point": None,
        "strikes": [
            {"strike": 5700000, "call_gex": 10000.0, "put_gex": -500000.0, "net_gex": -490000.0},
            {"strike": 5800000, "call_gex": 500000.0, "put_gex": -10000.0, "net_gex": 490000.0},
        ]
    }
    levels = GEXProcessor.process_raw_data("SPY", "SPY", sample_data, "2026-11-20T10:00:00Z")
    assert levels.gamma_flip == 5750.00

