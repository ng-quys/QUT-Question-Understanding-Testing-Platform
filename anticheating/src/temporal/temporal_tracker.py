import time
from dataclasses import dataclass
from typing import Optional


# ============================================================
# EVENT STATE
# ============================================================

@dataclass
class EventState:
    name: str
    threshold: float

    active: bool = False
    triggered: bool = False

    start_time: Optional[float] = None
    last_seen: Optional[float] = None

    duration: float = 0.0


# ============================================================
# TEMPORAL TRACKER
# ============================================================

class TemporalTracker:

    def __init__(self):
        self.events = {}


    # --------------------------------------------------------
    # REGISTER EVENT
    # --------------------------------------------------------

    def register(
        self,
        name,
        threshold
    ):
        self.events[name] = EventState(
            name=name,
            threshold=threshold
        )


    # --------------------------------------------------------
    # UPDATE EVENT
    # --------------------------------------------------------

    def update(
        self,
        name,
        detected,
        timestamp=None
    ):

        if name not in self.events:
            raise KeyError(
                f"Event not registered: {name}"
            )

        if timestamp is None:
            timestamp = time.time()

        event = self.events[name]


        # ====================================================
        # EVENT DETECTED
        # ====================================================

        if detected:

            # Event vừa bắt đầu
            if not event.active:

                event.active = True
                event.triggered = False

                event.start_time = timestamp
                event.last_seen = timestamp
                event.duration = 0.0

            # Event đang tiếp tục
            else:

                event.last_seen = timestamp

                event.duration = (
                    timestamp
                    - event.start_time
                )


            # ------------------------------------------------
            # CHECK THRESHOLD
            # ------------------------------------------------

            just_triggered = False

            if (
                event.duration >= event.threshold
                and not event.triggered
            ):
                event.triggered = True
                just_triggered = True


            return {
                "name": event.name,
                "active": True,
                "duration": event.duration,
                "triggered": event.triggered,
                "just_triggered": just_triggered,
                "previous_duration": None,
                "was_triggered": False,
            }


        # ====================================================
        # EVENT NOT DETECTED
        # ====================================================

        previous_duration = event.duration
        was_triggered = event.triggered

        event.active = False
        event.triggered = False

        event.start_time = None
        event.last_seen = None
        event.duration = 0.0


        return {
            "name": event.name,
            "active": False,
            "duration": 0.0,
            "triggered": False,
            "just_triggered": False,
            "previous_duration": previous_duration,
            "was_triggered": was_triggered,
        }


    # --------------------------------------------------------
    # GET EVENT
    # --------------------------------------------------------

    def get(self, name):
        return self.events.get(name)


    # --------------------------------------------------------
    # GET ACTIVE EVENTS
    # --------------------------------------------------------

    def active_events(self):
        return [
            event
            for event in self.events.values()
            if event.active
        ]


    # --------------------------------------------------------
    # GET TRIGGERED EVENTS
    # --------------------------------------------------------

    def triggered_events(self):
        return [
            event
            for event in self.events.values()
            if event.triggered
        ]


    # --------------------------------------------------------
    # RESET ONE EVENT
    # --------------------------------------------------------

    def reset(self, name):

        if name not in self.events:
            return

        event = self.events[name]

        event.active = False
        event.triggered = False

        event.start_time = None
        event.last_seen = None
        event.duration = 0.0


    # --------------------------------------------------------
    # RESET ALL
    # --------------------------------------------------------

    def reset_all(self):

        for name in self.events:
            self.reset(name)


# ============================================================
# DEFAULT ANTI-CHEATING TRACKER
# ============================================================

def create_anticheating_tracker():

    tracker = TemporalTracker()


    # ========================================================
    # IDENTITY / PERSON
    # ========================================================

    tracker.register(
        "NO_FACE",
        threshold=3.0
    )

    tracker.register(
        "MULTIPLE_PEOPLE",
        threshold=1.0
    )

    tracker.register(
        "SPOOF_FACE",
        threshold=1.0
    )

    tracker.register(
        "IDENTITY_MISMATCH",
        threshold=1.0
    )


    # ========================================================
    # HEAD BEHAVIOR
    # ========================================================

    tracker.register(
        "HEAD_LEFT",
        threshold=3.0
    )

    tracker.register(
        "HEAD_RIGHT",
        threshold=3.0
    )

    tracker.register(
        "HEAD_UP",
        threshold=3.0
    )

    tracker.register(
        "HEAD_DOWN",
        threshold=3.0
    )


    # ========================================================
    # HAND-OBJECT INTERACTION
    # ========================================================

    tracker.register(
        "HOLDING_PHONE",
        threshold=1.0
    )

    tracker.register(
        "HOLDING_STUDY_MATERIAL",
        threshold=1.0
    )

    tracker.register(
        "HOLDING_TABLET",
        threshold=1.0
    )


    # ========================================================
    # AUDIO
    # ========================================================

    tracker.register(
        "SPEECH",
        threshold=2.0
    )


    # ========================================================
    # BROWSER
    # ========================================================

    tracker.register(
        "TAB_HIDDEN",
        threshold=1.0
    )

    tracker.register(
        "FULLSCREEN_EXIT",
        threshold=1.0
    )

    return tracker


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    tracker = create_anticheating_tracker()

    print()
    print("====================================")
    print("TEMPORAL TRACKER TEST")
    print("====================================")
    print()

    print("Simulating HOLDING_PHONE...")
    print()

    for _ in range(8):

        result = tracker.update(
            "HOLDING_PHONE",
            True
        )

        print(
            f"duration={result['duration']:.2f}s | "
            f"triggered={result['triggered']} | "
            f"just_triggered={result['just_triggered']}"
        )

        time.sleep(0.25)


    print()
    print("Phone released.")

    result = tracker.update(
        "HOLDING_PHONE",
        False
    )

    print(result)


    # ========================================================
    # TEST SPOOF FACE
    # ========================================================

    print()
    print("Simulating SPOOF_FACE...")
    print()

    for _ in range(6):

        result = tracker.update(
            "SPOOF_FACE",
            True
        )

        print(
            f"duration={result['duration']:.2f}s | "
            f"triggered={result['triggered']} | "
            f"just_triggered={result['just_triggered']}"
        )

        time.sleep(0.25)


    print()
    print("Spoof removed.")

    result = tracker.update(
        "SPOOF_FACE",
        False
    )

    print(result)


    # ========================================================
    # TEST IDENTITY MISMATCH
    # ========================================================

    print()
    print("Simulating IDENTITY_MISMATCH...")
    print()

    for _ in range(6):

        result = tracker.update(
            "IDENTITY_MISMATCH",
            True
        )

        print(
            f"duration={result['duration']:.2f}s | "
            f"triggered={result['triggered']} | "
            f"just_triggered={result['just_triggered']}"
        )

        time.sleep(0.25)


    print()
    print("Correct identity restored.")

    result = tracker.update(
        "IDENTITY_MISMATCH",
        False
    )

    print(result)