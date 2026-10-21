"""Hand/object observations for sampled web frames, without model dependencies."""

EVENTS = {"mobile_phone": "HOLDING_PHONE", "study_material": "HOLDING_STUDY_MATERIAL",
          "tablet": "HOLDING_TABLET"}


def near_person(box, people):
    x1, y1, x2, y2 = box
    area = max(0, x2-x1) * max(0, y2-y1)
    if area <= 0:
        return False
    cx, cy = (x1+x2)/2, (y1+y2)/2
    for px1, py1, px2, py2 in people:
        width, height = px2-px1, py2-py1
        if width <= 0 or height <= 0 or not .01 <= area/(width*height) <= .35:
            continue
        if not (px1-.10*width <= cx <= px2+.10*width and
                py1-.05*height <= cy <= py2+.05*height and (cy-py1)/height >= .18):
            continue
        overlap = max(0, min(x2, px2)-max(x1, px1)) * max(0, min(y2, py2)-max(y1, py1))
        near_side = abs(cx-px1) <= width*.18 or abs(cx-px2) <= width*.18
        if overlap/area >= .10 or near_side:
            return True
    return False


def interaction_events(objects, hands, people, now, fallback_since, last_confirmed=None):
    """Match desktop fallback: confidence .45, near person, visible for 1.2s.

    The caller's temporal tracker still confirms the resulting event. State must
    be cleared between sampling leases/gaps; missing frames are not evidence.
    """
    events, candidates = set(), set()
    for name, (x1, y1, x2, y2), confidence in objects:
        event = EVENTS.get(name)
        if event is None:
            continue
        if any(sum(x1-30 <= x <= x2+30 and y1-30 <= y <= y2+30 for x, y in hand) >= 3
               for hand in hands):
            events.add(event)
        elif not hands and confidence >= .45 and near_person((x1, y1, x2, y2), people):
            candidates.add(event)
    for event in list(fallback_since):
        if event not in candidates or event in events:
            del fallback_since[event]
    for event in candidates-events:
        started = fallback_since.setdefault(event, now)
        if now-started >= 1.2:
            events.add(event)
    if last_confirmed is not None:
        for event in events:
            last_confirmed[event] = now
        # Same short grace period as direct camera, never across a sampling gap.
        events.update(event for event, seen in last_confirmed.items() if 0 <= now-seen <= .45)
    return events
