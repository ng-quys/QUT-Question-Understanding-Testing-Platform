"""Common decision settings for direct-camera and browser monitoring."""

FACE_MATCH_THRESHOLD = .40
LIVENESS_SCALE = 2.7
PERSON_CONF = .40
OBJECT_CONF = .25
M1_VOTE_WINDOW = 10
SPOOF_VOTE_REQUIRED = 8
MISMATCH_VOTE_REQUIRED = 8
VERIFIED_VOTE_REQUIRED = 6
AUDIO_SAMPLE_RATE = 16000
AUDIO_WINDOW = 10
AUDIO_SPEECH_RATIO = .6


def live_crop_bounds(shape, bbox):
    """Match the direct-camera MiniFASNet integer xywh crop exactly."""
    src_h, src_w = shape[:2]
    a, b, c, d = bbox
    x, y, width, height = int(a), int(b), int(c-a), int(d-b)
    if width <= 0 or height <= 0:
        return None
    scale = min((src_h-1)/height, (src_w-1)/width, LIVENESS_SCALE)
    cx, cy = x+width/2, y+height/2
    return (max(0, int(cx-width*scale/2)), max(0, int(cy-height*scale/2)),
            min(src_w-1, int(cx+width*scale/2))+1,
            min(src_h-1, int(cy+height*scale/2))+1)


def update_identity_votes(history, spoof, mismatch, verified):
    history.append((bool(spoof), bool(mismatch), bool(verified)))
    del history[:-M1_VOTE_WINDOW]
    if len(history) < M1_VOTE_WINDOW:
        return False, False, False
    counts = [sum(row[i] for row in history) for i in range(3)]
    return (counts[0] >= SPOOF_VOTE_REQUIRED, counts[1] >= MISMATCH_VOTE_REQUIRED,
            counts[2] >= VERIFIED_VOTE_REQUIRED)


def speech_observation(vad, audio):
    # Use the latest ten 30ms blocks, like the direct microphone's rolling window.
    blocks = [audio[i:i+960] for i in range(0, len(audio)-959, 960)][-AUDIO_WINDOW:]
    return bool(blocks) and sum(vad.is_speech(block, AUDIO_SAMPLE_RATE) for block in blocks)/len(blocks) >= AUDIO_SPEECH_RATIO
