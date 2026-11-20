import pytest
from app.core.basis import BasisConverter
from app.core.config import settings

def test_convert_level_to_target():
    # SPY strike 585.00 -> ES = (585 * 10) + basis(15) = 5865.00
    converted = BasisConverter.convert_level_to_target(585.0, "SPY", "ES1!")
    assert converted == 5865.00

    # SPY to SPY (identity)
    assert BasisConverter.convert_level_to_target(585.0, "SPY", "SPY") == 585.0

    # GLD 240.0 -> GC = 2400.0
    assert BasisConverter.convert_level_to_target(240.0, "GLD", "GC1!") == 2400.0

