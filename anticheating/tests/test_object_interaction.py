import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT))
from object_interaction import interaction_events
from src.temporal.temporal_tracker import create_anticheating_tracker


class ObjectInteractionTests(unittest.TestCase):
    # Coordinates and confidence from the user's screenshot, resized to 640x480.
    phone = [("mobile_phone", [180.1, 121.2, 397.6, 439.7], .694)]
    people = [[9.7, 8.4, 551.2, 478.3]]

    def test_phone_without_hand_landmarks_requires_sustained_observation(self):
        state, tracker = {}, create_anticheating_tracker()
        alerts = []
        for now in [10, 10.6, 11.3, 11.9, 12.5, 13.1]:
            events = interaction_events(self.phone, [], self.people, now, state)
            result = tracker.update("HOLDING_PHONE", "HOLDING_PHONE" in events, now)
            if result["just_triggered"]:
                alerts.append(now)
        self.assertEqual([12.5], alerts)

    def test_single_frame_or_disappearance_does_not_confirm_phone(self):
        state = {}
        self.assertFalse(interaction_events(self.phone, [], self.people, 10, state))
        self.assertFalse(interaction_events([], [], self.people, 11, state))
        self.assertFalse(state)
        self.assertFalse(interaction_events(self.phone, [], self.people, 12, state))

    def test_low_confidence_or_no_person_does_not_use_fallback(self):
        weak = [("mobile_phone", self.phone[0][1], .44)]
        for objects, people in [(weak, self.people), (self.phone, []),
                                (self.phone, [[450, 10, 640, 480]])]:
            state = {}
            for now in [10, 12, 14]:
                self.assertFalse(interaction_events(objects, [], people, now, state))

    def test_direct_hand_confirmation_is_preserved(self):
        hands = [[(200, 200), (210, 210), (220, 220)]]
        self.assertEqual({"HOLDING_PHONE"}, interaction_events(self.phone, hands, self.people, 10, {}))

    def test_visible_unrelated_hand_does_not_confirm_holding(self):
        state = {}
        for now in [10, 12, 14]:
            self.assertFalse(interaction_events(self.phone, [[(600, 10)]*3], self.people, now, state))

    def test_reset_sampling_state_does_not_carry_old_duration(self):
        state = {}
        interaction_events(self.phone, [], self.people, 10, state)
        state.clear()
        self.assertFalse(interaction_events(self.phone, [], self.people, 30, state))

    def test_brief_hand_occlusion_has_only_desktop_grace_period(self):
        state, seen = {}, {}
        hands = [[(200, 200), (210, 210), (220, 220)]]
        interaction_events(self.phone, hands, self.people, 10, state, seen)
        self.assertEqual({"HOLDING_PHONE"}, interaction_events([], [], self.people, 10.3, state, seen))
        self.assertFalse(interaction_events([], [], self.people, 10.5, state, seen))


if __name__ == "__main__":
    unittest.main()
