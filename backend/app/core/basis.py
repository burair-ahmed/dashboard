from typing import Dict
from app.core.config import settings

class BasisConverter:
    """
    Handles conversion between ETF/cash levels and futures contract prices.
    E.g., SPY -> ES, QQQ -> NQ, GLD -> GC.
    """

    # Multipliers from ETF strike to futures points
    ETF_MULTIPLIERS = {
        "SPY": 10.0,
        "QQQ": 40.0,  # Or NQ ratio based on index divisor (~40-42x depending on index price)
        "GLD": 10.0,
        "SLV": 1.0,
    }

    @classmethod
    def get_basis_offset(cls, underlying: str) -> float:
        """Returns the basis spread offset between cash/ETF and futures."""
        if settings.CASH_FUTURES_BASIS_MODE == "none":
            return 0.0
        
        if underlying == "SPY":
            return settings.MANUAL_ES_BASIS
        elif underlying == "QQQ":
            return settings.MANUAL_NQ_BASIS
        return 0.0

    @classmethod
    def convert_level_to_target(cls, underlying_level: float, source_sym: str, target_sym: str) -> float:
        """
        Converts a price level from source underlying to target trading instrument.
        """
        source = source_sym.upper()
        target = target_sym.upper()

        if source == target:
            return round(underlying_level, 2)

        # SPY -> ES conversion
        if source == "SPY" and ("ES" in target or "SPX" in target):
            mult = cls.ETF_MULTIPLIERS.get("SPY", 10.0)
            basis = cls.get_basis_offset("SPY") if "ES" in target else 0.0
            return round((underlying_level * mult) + basis, 2)

        # QQQ -> NQ / NDX conversion
        if source == "QQQ" and ("NQ" in target or "NDX" in target):
            # If converting to NDX / NQ, use approximate ratio ~40x
            mult = cls.ETF_MULTIPLIERS.get("QQQ", 40.0)
            basis = cls.get_basis_offset("QQQ") if "NQ" in target else 0.0
            return round((underlying_level * mult) + basis, 2)

        # GLD -> GC (Gold futures)
        if source == "GLD" and ("GC" in target or "GOLD" in target or "XAU" in target):
            mult = cls.ETF_MULTIPLIERS.get("GLD", 10.0)
            return round(underlying_level * mult, 2)

        # Default fallback
        return round(underlying_level, 2)

