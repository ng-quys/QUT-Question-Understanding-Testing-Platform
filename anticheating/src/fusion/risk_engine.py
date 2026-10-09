from dataclasses import dataclass, field
from typing import Dict, List


# ============================================================
# CONFIG
# ============================================================

EVENT_WEIGHTS = {
    # Identity / person
    "IDENTITY_MISMATCH": 50,
    "SPOOF_FACE": 50,
    "NO_FACE": 20,
    "MULTIPLE_PEOPLE": 35,

    # Head behavior
    "HEAD_LEFT": 10,
    "HEAD_RIGHT": 10,
    "HEAD_UP": 5,
    "HEAD_DOWN": 10,

    # Object / interaction
    "HOLDING_PHONE": 40,
    "HOLDING_STUDY_MATERIAL": 35,
    "HOLDING_TABLET": 35,
    "INTERACTING_LAPTOP": 20,

    # Audio
    "SPEECH": 15,

    # Browser
    "TAB_HIDDEN": 25,
    "FULLSCREEN_EXIT": 20,
    "COPY": 10,
    "PASTE": 15,
}

LOW_THRESHOLD = 0
MEDIUM_THRESHOLD = 25
HIGH_THRESHOLD = 50
CRITICAL_THRESHOLD = 75


# ============================================================
# RESULT
# ============================================================

@dataclass
class RiskResult:
    score: int
    level: str
    active_events: List[str] = field(default_factory=list)
    event_scores: Dict[str, int] = field(default_factory=dict)


# ============================================================
# RISK ENGINE
# ============================================================

class RiskEngine:

    def __init__(self, event_weights=None):
        self.event_weights = (
            event_weights
            if event_weights is not None
            else EVENT_WEIGHTS.copy()
        )

    def get_level(self, score: int) -> str:

        if score >= CRITICAL_THRESHOLD:
            return "CRITICAL"

        if score >= HIGH_THRESHOLD:
            return "HIGH"

        if score >= MEDIUM_THRESHOLD:
            return "MEDIUM"

        return "LOW"

    def calculate(self, events: List[str]) -> RiskResult:

        unique_events = list(dict.fromkeys(events))

        event_scores = {}
        total_score = 0

        for event in unique_events:

            weight = self.event_weights.get(
                event,
                0
            )

            event_scores[event] = weight
            total_score += weight

        # Giới hạn 0–100
        total_score = min(
            max(total_score, 0),
            100
        )

        level = self.get_level(
            total_score
        )

        return RiskResult(
            score=total_score,
            level=level,
            active_events=unique_events,
            event_scores=event_scores,
        )


# ============================================================
# DISPLAY HELPER
# ============================================================

def print_risk_result(result: RiskResult):

    print()
    print("====================================")
    print("RISK RESULT")
    print("====================================")

    print("Events:")

    if not result.active_events:
        print("  None")

    else:

        for event in result.active_events:

            score = result.event_scores.get(
                event,
                0
            )

            print(
                f"  {event}: +{score}"
            )

    print()
    print(
        f"TOTAL SCORE: {result.score}/100"
    )

    print(
        f"RISK LEVEL: {result.level}"
    )

    print("====================================")
    print()


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    engine = RiskEngine()

    print()
    print("ANTI-CHEATING RISK ENGINE TEST")


    # --------------------------------------------------------
    # CASE 1
    # --------------------------------------------------------

    print()
    print("CASE 1: Normal")

    result = engine.calculate(
        []
    )

    print_risk_result(
        result
    )


    # --------------------------------------------------------
    # CASE 2
    # --------------------------------------------------------

    print(
        "CASE 2: Head down only"
    )

    result = engine.calculate(
        [
            "HEAD_DOWN",
        ]
    )

    print_risk_result(
        result
    )


    # --------------------------------------------------------
    # CASE 3
    # --------------------------------------------------------

    print(
        "CASE 3: Speech + tab hidden"
    )

    result = engine.calculate(
        [
            "SPEECH",
            "TAB_HIDDEN",
        ]
    )

    print_risk_result(
        result
    )


    # --------------------------------------------------------
    # CASE 4
    # --------------------------------------------------------

    print(
        "CASE 4: Holding phone"
    )

    result = engine.calculate(
        [
            "HOLDING_PHONE",
        ]
    )

    print_risk_result(
        result
    )


    # --------------------------------------------------------
    # CASE 5
    # --------------------------------------------------------

    print(
        "CASE 5: Multiple suspicious events"
    )

    result = engine.calculate(
        [
            "HEAD_DOWN",
            "SPEECH",
            "HOLDING_PHONE",
            "TAB_HIDDEN",
        ]
    )

    print_risk_result(
        result
    )


    # --------------------------------------------------------
    # CASE 6
    # --------------------------------------------------------

    print(
        "CASE 6: Critical identity problem"
    )

    result = engine.calculate(
        [
            "IDENTITY_MISMATCH",
            "SPOOF_FACE",
        ]
    )

    print_risk_result(
        result
    )