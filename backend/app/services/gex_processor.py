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
    bull_trigger: float
    bear_trigger: float
    top_positive_strikes: List[float] = Field(default_factory=list)
    top_negative_strikes: List[float] = Field(default_factory=list)
    strikes: List[StrikeGEX] = Field(default_factory=list)
    total_net_gex: float
    regime: str  # "POSITIVE_GAMMA" (low volatility / mean reverting) or "NEGATIVE_GAMMA" (high volatility / momentum)
    compact_string: str  # Optimized string for Pine Script copy-paste fallback
    gex_pro_text: str    # Exact multi-line formatted text for GEX Levels Pro indicator

class GEXProcessor:
    """
    Extracts core GEX levels (Call Wall, Put Wall, Gamma Flip, Top Strikes)
    and formats them for:
    1. Direct native chart drawing (Layer 1)
    2. GEX Levels Pro indicator (multi-line automated input)
    3. Compact string fallback (Layer 3)
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
        raw_spot = data.get("spot") or data.get("underlying_price", 0.0)
        underlying_price = cls.normalize_strike(float(raw_spot))
        strikes_data = data.get("strikes", [])
        
        parsed_strikes: List[StrikeGEX] = []
        for item in strikes_data:
            s_price = cls.normalize_strike(float(item.get("strike", 0.0)))
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

        # 1. Call Wall & Put Wall
        pos_strikes = [s for s in parsed_strikes if s.gex > 0]
        neg_strikes = [s for s in parsed_strikes if s.gex < 0]

        call_wall = max(pos_strikes, key=lambda s: s.gex).strike if pos_strikes else round(underlying_price * 1.02, 2)
        put_wall = min(neg_strikes, key=lambda s: s.gex).strike if neg_strikes else round(underlying_price * 0.98, 2)

        # 2. Gamma Flip Point
        api_flip = data.get("flip_point")
        if api_flip is not None and float(api_flip) > 0:
            gamma_flip = cls.normalize_strike(float(api_flip))
        else:
            gamma_flip = cls._calculate_zero_crossing(parsed_strikes, underlying_price)

        # 3. Top Strikes
        sorted_pos = sorted(pos_strikes, key=lambda s: s.gex, reverse=True)
        sorted_neg = sorted(neg_strikes, key=lambda s: s.gex)
        top_pos = [s.strike for s in sorted_pos[:3]]
        top_neg = [s.strike for s in sorted_neg[:3]]

        # Total Net GEX
        raw_net = data.get("net_gex")
        total_net_gex = float(raw_net) if raw_net is not None else sum(s.gex for s in parsed_strikes)
        regime = "POSITIVE_GAMMA" if total_net_gex >= 0 else "NEGATIVE_GAMMA"

        # 4. Bull & Bear Triggers
        sorted_by_price = sorted(parsed_strikes, key=lambda s: s.strike)
        above_spot = [s for s in sorted_by_price if s.strike > underlying_price]
        below_spot = [s for s in sorted_by_price if s.strike < underlying_price]
        bull_trig = min(above_spot, key=lambda s: s.strike).strike if above_spot else round(underlying_price + 1.0, 2)
        bear_trig = max(below_spot, key=lambda s: s.strike).strike if below_spot else round(underlying_price - 1.0, 2)

        # 5. Build Compact Pine Script String
        compact_str = (
            f"CW:{call_wall:.2f}|PW:{put_wall:.2f}|GF:{gamma_flip:.2f}|"
            f"R:{'POS' if total_net_gex >= 0 else 'NEG'}"
        )

        # 6. Build GEX Levels Pro Multi-line Text
        gex_pro_text = cls._generate_gex_pro_plan(
            spot=underlying_price,
            call_wall=call_wall,
            put_wall=put_wall,
            gamma_flip=gamma_flip,
            strikes=parsed_strikes,
            total_net_gex=total_net_gex
        )

        return GEXLevels(
            symbol=symbol,
            target_symbol=target_symbol,
            timestamp=timestamp,
            underlying_price=underlying_price,
            call_wall=call_wall,
            put_wall=put_wall,
            gamma_flip=gamma_flip,
            bull_trigger=bull_trig,
            bear_trigger=bear_trig,
            top_positive_strikes=top_pos,
            top_negative_strikes=top_neg,
            strikes=sorted_by_price,
            total_net_gex=round(total_net_gex, 2),
            regime=regime,
            compact_string=compact_str,
            gex_pro_text=gex_pro_text
        )

    @classmethod
    def _generate_gex_pro_plan(
        cls,
        spot: float,
        call_wall: float,
        put_wall: float,
        gamma_flip: float,
        strikes: List[StrikeGEX],
        total_net_gex: float
    ) -> str:
        """
        Generates the exact formatted multi-line string required by GEX_Levels_Pro_v15:
        Format: price | type | GEX (M) | description
        """
        sorted_by_price = sorted(strikes, key=lambda s: s.strike)
        above_spot = [s for s in sorted_by_price if s.strike > spot]
        below_spot = [s for s in sorted_by_price if s.strike < spot]

        # Bull Trigger: first key level / strike above spot (or flip)
        bull_trig = min(above_spot, key=lambda s: s.strike).strike if above_spot else round(spot + 1.0, 2)
        # Bear Trigger: first key level / strike below spot (or flip)
        bear_trig = max(below_spot, key=lambda s: s.strike).strike if below_spot else round(spot - 1.0, 2)

        # Select top resistance levels above bull trigger
        top_r_candidates = sorted([s for s in above_spot if s.strike > bull_trig and s.gex > 0], key=lambda s: s.gex, reverse=True)[:5]
        # Always include Call Wall in resistance if above spot
        call_wall_in = any(r.strike == call_wall for r in top_r_candidates)
        if not call_wall_in and call_wall > bull_trig:
            cw_obj = next((s for s in strikes if s.strike == call_wall), None)
            if cw_obj:
                top_r_candidates.append(cw_obj)

        # Select top support levels below bear trigger
        top_s_candidates = sorted([s for s in below_spot if s.strike < bear_trig and s.gex < 0], key=lambda s: s.gex)[:5]
        put_wall_in = any(s.strike == put_wall for s in top_s_candidates)
        if not put_wall_in and put_wall < bear_trig:
            pw_obj = next((s for s in strikes if s.strike == put_wall), None)
            if pw_obj:
                top_s_candidates.append(pw_obj)

        lines: List[str] = []

        # Resistance lines sorted descending
        r_sorted = sorted(top_r_candidates, key=lambda s: s.strike, reverse=True)
        for idx, r in enumerate(r_sorted):
            gex_m = round(r.gex / 1_000_000.0, 2)
            t_num = len(r_sorted) - idx
            desc = "Major +GEX wall" if r.strike == call_wall else f"Upper +GEX · Bull T{t_num}"
            lines.append(f"{r.strike}|R|{gex_m}|{desc}")

        # Key Triggers (K lines set the bull and bear triggers automatically)
        lines.append(f"{bull_trig}|K||BULL TRIGGER (reclaim & hold)")
        lines.append(f"{bear_trig}|K||BEAR TRIGGER (lose it)")

        # Support lines sorted descending
        s_sorted = sorted(top_s_candidates, key=lambda s: s.strike, reverse=True)
        for idx, s in enumerate(s_sorted):
            gex_m = round(s.gex / 1_000_000.0, 2)
            desc = "Key -GEX wall · vol below" if s.strike == put_wall else f"Lower gamma · Bear T{idx + 1}"
            lines.append(f"{s.strike}|S|{gex_m}|{desc}")

        # Metadata Lines
        net_m = round(total_net_gex / 1_000_000.0, 2)
        lines.append(f"NET|{net_m}")
        lines.append(f"HV|{gamma_flip}")
        lines.append(f"REJ|{bear_trig}|{bull_trig}")

        return "\n".join(lines)

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
            best_candidate = min(candidates, key=lambda c: abs(c - spot_price))
            return best_candidate

        return round(spot_price, 2)
