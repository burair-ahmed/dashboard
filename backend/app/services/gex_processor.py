from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class StrikeGEX(BaseModel):
    strike: float
    gex: float
    call_gex: Optional[float] = None
    put_gex: Optional[float] = None
    net_gex: float
    total_open_interest: Optional[int] = None

class GEXLevels(BaseModel):
    symbol: str
    target_symbol: str
    timestamp: str
    underlying_price: float
    call_wall: float
    put_wall: float
    gamma_flip: float
    top_positive_strikes: List[float] = Field(default_factory=list)
    top_negative_strikes: List[float] = Field(default_factory=list)
    total_net_gex: float
    regime: str  # "POSITIVE_GAMMA" (low volatility / mean reverting) or "NEGATIVE_GAMMA" (high volatility / momentum)
    compact_string: str  # Optimized string for Pine Script copy-paste fallback

class GEXProcessor:
    """
    Extracts core GEX levels (Call Wall, Put Wall, Gamma Flip, Top Strikes)
    and formats them for both chart drawing and Pine Script indicator inputs.
    Fully compliant with ITMatrixHQ API v2 specs.
    """

    @staticmethod
    def normalize_strike(raw_strike: float) -> float:
        """
        ITMatrixHQ provides strikes in thousandths of a dollar (e.g. 700000 -> 700.00).
        If already in standard dollar units (< 100,000 for standard indices), leave as-is.
        """
        if raw_strike > 100000:
            return round(raw_strike / 1000.0, 2)
        return round(raw_strike, 2)

    @classmethod
    def process_raw_data(
        cls,
        symbol: str,
        target_symbol: str,
        data: Dict[str, Any],
        timestamp: str
    ) -> GEXLevels:
        """
        Processes raw options chain and GEX breakdown from API into structured levels.
        """
        # ITMatrixHQ provides 'spot' in dollars
        raw_spot = data.get("spot") or data.get("underlying_price", 0.0)
        underlying_price = cls.normalize_strike(float(raw_spot))
        strikes_data = data.get("strikes", [])
        
        parsed_strikes: List[StrikeGEX] = []
        for item in strikes_data:
            s_price = cls.normalize_strike(float(item.get("strike", 0.0)))
            
            # ITMatrixHQ v2 /v2/gex/{symbol}/grid provides 'gex' directly:
            # Positive for call gamma, negative for put gamma
            gex_val = float(item.get("gex", item.get("net_gex", 0.0)))
            c_gex = float(item.get("call_gex", gex_val if gex_val > 0 else 0.0))
            p_gex = float(item.get("put_gex", gex_val if gex_val < 0 else 0.0))
            call_oi = item.get("call_oi", 0) or 0
            put_oi = item.get("put_oi", 0) or 0
            
            parsed_strikes.append(StrikeGEX(
                strike=s_price,
                gex=gex_val,
                call_gex=c_gex,
                put_gex=p_gex,
                net_gex=gex_val,
                total_open_interest=call_oi + put_oi
            ))

        # 1. Call Wall: Strike with maximum positive gamma (dealer resistance)
        pos_strikes = [s for s in parsed_strikes if s.gex > 0]
        if pos_strikes:
            call_wall = max(pos_strikes, key=lambda s: s.gex).strike
        else:
            call_wall = underlying_price * 1.02

        # 2. Put Wall: Strike with largest negative gamma (dealer support)
        neg_strikes = [s for s in parsed_strikes if s.gex < 0]
        if neg_strikes:
            put_wall = min(neg_strikes, key=lambda s: s.gex).strike
        else:
            put_wall = underlying_price * 0.98

        # 3. Gamma Flip Point:
        # Check if provided explicitly by API (in dollars)
        api_flip = data.get("flip_point")
        if api_flip is not None and float(api_flip) > 0:
            gamma_flip = cls.normalize_strike(float(api_flip))
        else:
            # Fallback heuristic: find zero-crossing in net_gex nearest to spot price
            gamma_flip = cls._calculate_zero_crossing(parsed_strikes, underlying_price)

        # 4. Top Strikes
        sorted_pos = sorted(pos_strikes, key=lambda s: s.gex, reverse=True)
        sorted_neg = sorted(neg_strikes, key=lambda s: s.gex)
        top_pos = [s.strike for s in sorted_pos[:3]]
        top_neg = [s.strike for s in sorted_neg[:3]]

        # Total Net GEX
        raw_net = data.get("net_gex")
        total_net_gex = float(raw_net) if raw_net is not None else sum(s.gex for s in parsed_strikes)
        regime = "POSITIVE_GAMMA" if total_net_gex >= 0 else "NEGATIVE_GAMMA"

        # 5. Build Compact Pine Script String
        compact_str = (
            f"CW:{call_wall:.2f}|PW:{put_wall:.2f}|GF:{gamma_flip:.2f}|"
            f"R:{'POS' if total_net_gex >= 0 else 'NEG'}"
        )

        return GEXLevels(
            symbol=symbol,
            target_symbol=target_symbol,
            timestamp=timestamp,
            underlying_price=underlying_price,
            call_wall=call_wall,
            put_wall=put_wall,
            gamma_flip=gamma_flip,
            top_positive_strikes=top_pos,
            top_negative_strikes=top_neg,
            total_net_gex=round(total_net_gex, 2),
            regime=regime,
            compact_string=compact_str
        )

    @staticmethod
    def _calculate_zero_crossing(strikes: List[StrikeGEX], spot_price: float) -> float:
        """
        Finds the strike price transition where Net GEX changes from negative to positive,
        prioritizing the transition closest to the current spot price.
        """
        if not strikes:
            return round(spot_price, 2)

        sorted_by_strike = sorted(strikes, key=lambda s: s.strike)
        candidates: List[float] = []

        for i in range(len(sorted_by_strike) - 1):
            curr_s = sorted_by_strike[i]
            next_s = sorted_by_strike[i + 1]
            if (curr_s.gex <= 0 and next_s.gex > 0) or (curr_s.gex >= 0 and next_s.gex < 0):
                cross_level = round((curr_s.strike + next_s.strike) / 2.0, 2)
                candidates.append(cross_level)

        if candidates:
            # Pick candidate closest to current spot price
            best_candidate = min(candidates, key=lambda c: abs(c - spot_price))
            return best_candidate

        return round(spot_price, 2)
