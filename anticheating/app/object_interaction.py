"""Confirm visible objects over sampled frames without hand or holding inference."""

EVENTS = {
    "mobile_phone": "PHONE_VISIBLE",
    "tablet": "TABLET_VISIBLE",
    "study_material": "MATERIAL_VISIBLE",
    "book": "MATERIAL_VISIBLE",
    "paper": "MATERIAL_VISIBLE",
}
MIN_CONFIDENCE = .45
MIN_VISIBLE_SECONDS = 1.2


def visible_object_events(objects, now, visible_since):
    """Require repeated confident observations before the caller's temporal tracker.

    Visibility does not require a person box or hand overlap. Callers reset this
    state across sampling gaps. Disappearance resets rather than extends a timer.
    """
    candidates = set()
    for name, (x1, y1, x2, y2), confidence in objects:
        event = EVENTS.get(name)
        if event and confidence >= MIN_CONFIDENCE and x2 > x1 and y2 > y1:
            candidates.add(event)
    for event in list(visible_since):
        if event not in candidates:
            del visible_since[event]
    confirmed = set()
    for event in candidates:
        started = visible_since.setdefault(event, now)
        if now - started >= MIN_VISIBLE_SECONDS:
            confirmed.add(event)
    return confirmed
