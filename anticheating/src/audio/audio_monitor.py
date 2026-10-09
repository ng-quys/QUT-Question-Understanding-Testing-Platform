import time
import queue

import numpy as np
import sounddevice as sd


# ============================================================
# CONFIG
# ============================================================

SAMPLE_RATE = 16000
BLOCK_SIZE = 1024

# Ngưỡng RMS để coi là có âm thanh đáng kể
RMS_THRESHOLD = 0.02

# Nếu âm thanh vượt ngưỡng liên tục đủ lâu thì cảnh báo
ALERT_SECONDS = 2.0


# ============================================================
# STATE
# ============================================================

audio_queue = queue.Queue()

active_start_time = None


# ============================================================
# CALLBACK
# ============================================================

def audio_callback(indata, frames, time_info, status):

    if status:
        print("Audio status:", status)

    audio_queue.put(indata.copy())


# ============================================================
# HELPERS
# ============================================================

def calculate_rms(audio):

    audio = np.asarray(
        audio,
        dtype=np.float32
    )

    return float(
        np.sqrt(
            np.mean(
                np.square(audio)
            )
        )
    )


# ============================================================
# MAIN
# ============================================================

print()
print("====================================")
print("AUDIO MONITOR")
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
        blocksize=BLOCK_SIZE,
        callback=audio_callback,
    ):

        while True:

            audio = audio_queue.get()

            rms = calculate_rms(audio)

            now = time.time()

            # -----------------------------------------------
            # ACTIVE AUDIO
            # -----------------------------------------------

            if rms >= RMS_THRESHOLD:

                if active_start_time is None:
                    active_start_time = now

                duration = (
                    now - active_start_time
                )

                if duration >= ALERT_SECONDS:

                    status = (
                        f"ALERT AUDIO "
                        f"{duration:.1f}s"
                    )

                else:

                    status = (
                        f"AUDIO ACTIVE "
                        f"{duration:.1f}s"
                    )

            # -----------------------------------------------
            # SILENCE
            # -----------------------------------------------

            else:

                active_start_time = None
                duration = 0.0
                status = "SILENCE"


            print(
                f"\r"
                f"RMS={rms:.4f} | "
                f"{status}          ",
                end="",
                flush=True,
            )


except KeyboardInterrupt:

    print()
    print("Stopped.")