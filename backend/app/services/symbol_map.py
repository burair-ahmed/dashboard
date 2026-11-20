from typing import Optional, Dict

class SymbolMapper:
    """
    Normalizes TradingView symbols (e.g. CME_MINI:ES1!, SPY, NASDAQ:QQQ)
    to the GEX option underlying ticker (SPY, QQQ, SPX, etc.).
    """

    MAPPING: Dict[str, str] = {
        # S&P 500
        "SPY": "SPY",
        "SPX": "SPX",
        "SPXW": "SPX",
        "ES": "SPY",
        "ES1!": "SPY",
        "ES2!": "SPY",
        "CME_MINI:ES1!": "SPY",
        "AMEX:SPY": "SPY",
        "INDEX:SPX": "SPX",

        # Nasdaq 100
        "QQQ": "QQQ",
        "NDX": "NDX",
        "NQ": "QQQ",
        "NQ1!": "QQQ",
        "NQ2!": "QQQ",
        "CME_MINI:NQ1!": "QQQ",
        "NASDAQ:QQQ": "QQQ",
        "INDEX:NDX": "NDX",

        # Precious Metals
        "GLD": "GLD",
        "GC": "GLD",
        "GC1!": "GLD",
        "XAUUSD": "GLD",
        "SLV": "SLV",
        "SI": "SLV",
        "SI1!": "SLV",
        "XAGUSD": "SLV",
    }

    @classmethod
    def resolve_underlying(cls, tv_symbol: str) -> str:
        """
        Extracts the clean underlying asset code from a TradingView symbol string.
        """
        if not tv_symbol:
            return "SPY"
        
        cleaned = tv_symbol.strip().upper()
        
        # Check direct lookup
        if cleaned in cls.MAPPING:
            return cls.MAPPING[cleaned]
        
        # Strip exchange prefix (e.g., "CME:ES1!" -> "ES1!")
        if ":" in cleaned:
            ticker_part = cleaned.split(":")[-1]
            if ticker_part in cls.MAPPING:
                return cls.MAPPING[ticker_part]
            cleaned = ticker_part

        # Check prefixes
        for key, underlying in cls.MAPPING.items():
            if cleaned.startswith(key):
                return underlying

        return cleaned

