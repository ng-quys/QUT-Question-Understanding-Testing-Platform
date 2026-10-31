import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT))
from object_interaction import visible_object_events
from src.temporal.temporal_tracker import create_anticheating_tracker


class ObjectInteractionTests(unittest.TestCase):
    # Coordinates and confidence from the user's screenshot, resized to 640x480.
    phone = [("mobile_phone", [180.1, 121.2, 397.6, 439.7], .694)]

    def test_visible_phone_requires_sustained_observation_and_temporal_confirmation(self):
        state, tracker = {}, create_anticheating_tracker()
        alerts = []
        for now in [10, 10.6, 11.3, 11.9, 12.5, 13.1]:
            events = visible_object_events(self.phone, now, state)
            result = tracker.update("PHONE_VISIBLE", "PHONE_VISIBLE" in events, now)
            if result["just_triggered"]:
                alerts.append(now)
        self.assertEqual([12.5], alerts)

    def test_single_frame_or_disappearance_does_not_confirm_phone(self):
        state = {}
        self.assertFalse(visible_object_events(self.phone, 10, state))
        self.assertFalse(visible_object_events([], 11, state))
        self.assertFalse(state)
        self.assertFalse(visible_object_events(self.phone, 12, state))

    def test_low_confidence_or_invalid_box_does_not_confirm(self):
        weak = [("mobile_phone", self.phone[0][1], .44)]
        invalid = [("mobile_phone", [100, 100, 90, 120], .9)]
        for objects in (weak, invalid):
            state = {}
            for now in [10, 12, 14]:
                self.assertFalse(visible_object_events(objects, now, state))

    def test_visible_phone_does_not_require_hand_or_person_detection(self):
        state = {}
        visible_object_events(self.phone, 10, state)
        self.assertEqual({"PHONE_VISIBLE"}, visible_object_events(self.phone, 11.3, state))

    def test_multiple_material_classes_make_one_event_and_tablet_is_distinct(self):
        objects = [(label, [10, 10, 100, 100], .8)
                   for label in ('book', 'paper', 'study_material', 'tablet', 'laptop')]
        state = {}
        visible_object_events(objects, 10, state)
        self.assertEqual({'MATERIAL_VISIBLE', 'TABLET_VISIBLE'},
                         visible_object_events(objects, 11.3, state))

    def test_reset_sampling_state_does_not_carry_old_duration(self):
        state = {}
        visible_object_events(self.phone, 10, state)
        state.clear()
        self.assertFalse(visible_object_events(self.phone, 30, state))

    def test_disappearance_does_not_keep_stale_visibility_or_duration(self):
        state = {}
        visible_object_events(self.phone, 10, state)
        self.assertEqual({'PHONE_VISIBLE'}, visible_object_events(self.phone, 12, state))
        self.assertFalse(visible_object_events([], 12.1, state))
        self.assertFalse(visible_object_events(self.phone, 12.2, state))

    def test_visible_objects_keep_nonzero_review_weights(self):
        from src.fusion.risk_engine import RiskEngine
        engine = RiskEngine()
        self.assertEqual(40, engine.calculate(['PHONE_VISIBLE']).score)
        self.assertEqual(35, engine.calculate(['MATERIAL_VISIBLE']).score)
        self.assertEqual(35, engine.calculate(['TABLET_VISIBLE']).score)


if __name__ == "__main__":
    unittest.main()
