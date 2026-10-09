import collections
import time

import numpy as np
import sounddevice as sd
import webrtcvad


# ============================================================
# CONFIG
# ============================================================

SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30

SAMPLES_PER_FRAME = int(
    SAMPLE_RATE * FRAME_DURATION_MS / 1000
)

VAD_MODE = 2
ALERT_SECONDS = 2.0

# Tỷ lệ frame speech trong cửa sổ ngắn để coi là đang nói
WINDOW_FRAMES = 10
SPEECH_RATIO_THRESHOLD = 0.6


# ============================================================
# VAD
# ============================================================

vad = webrtcvad.Vad(VAD_MODE)

speech_history = collections.deque(
    maxlen=WINDOW_FRAMES
)

speech_start_time = None


# ============================================================
# AUDIO CALLBACK
# ============================================================

def audio_callback(
    indata,
    frames,
    time_info,
    status
):

    if status:
        print("Audio status:", status)

    audio = indata[:, 0]

    audio = np.clip(
        audio,
        -1.0,
        1.0
    )

    pcm16 = (
        audio * 32767
    ).astype(np.int16)

    raw_bytes = pcm16.tobytes()

    is_speech = vad.is_speech(
        raw_bytes,
        SAMPLE_RATE
    )

    speech_history.append(
        1 if is_speech else 0
    )


# ============================================================
# MAIN
# ============================================================

print()
print("====================================")
print("VOICE ACTIVITY DETECTOR")
print("====================================")
print("Speak into microphone to test")
print("Ctrl+C = quit")
print("====================================")
print()

try:

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=SAMPLES_PER_FRAME,
        callback=audio_callback,
    ):

        while True:

            time.sleep(0.05)

            if not speech_history:
                continue

            speech_ratio = (
                sum(speech_history)
                / len(speech_history)
            )

            now = time.time()

            # -----------------------------------------------
            # SPEECH
            # -----------------------------------------------

            if (
                speech_ratio
                >= SPEECH_RATIO_THRESHOLD
            ):

                if speech_start_time is None:
                    speech_start_time = now

                duration = (
                    now - speech_start_time
                )

                if duration >= ALERT_SECONDS:

                    status = (
                        f"SPEECH ALERT "
                        f"{duration:.1f}s"
                    )

                else:

                    status = (
                        f"SPEECH "
                        f"{duration:.1f}s"
                    )

            # -----------------------------------------------
            # NON-SPEECH
            # -----------------------------------------------

            else:

                speech_start_time = None
                duration = 0.0

                status = "NO SPEECH"


            print(
                f"\r"
                f"speech_ratio="
                f"{speech_ratio:.2f} | "
                f"{status}          ",
                end="",
                flush=True,
            )


except KeyboardInterrupt:

    print()
    print("Stopped.")