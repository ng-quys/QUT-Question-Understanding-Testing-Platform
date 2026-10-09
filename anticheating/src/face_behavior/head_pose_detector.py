import cv2
import time
from insightface.app import FaceAnalysis


# ============================================================
# CONFIG
# ============================================================

YAW_LEFT_THRESHOLD = -20
YAW_RIGHT_THRESHOLD = 20

PITCH_UP_THRESHOLD = -15
PITCH_DOWN_THRESHOLD = 15

ALERT_SECONDS = 3.0


# ============================================================
# INSIGHTFACE
# ============================================================

print("Loading InsightFace...")

app = FaceAnalysis(
    name="buffalo_l",
    providers=[
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ],
)

app.prepare(
    ctx_id=0,
    det_size=(640, 640),
)

print("InsightFace ready.")


# ============================================================
# CLASSIFY HEAD DIRECTION
# ============================================================

def classify_direction(pitch, yaw):

    if yaw > YAW_RIGHT_THRESHOLD:
        return "LEFT"

    if yaw < YAW_LEFT_THRESHOLD:
        return "RIGHT"

    if pitch < PITCH_UP_THRESHOLD:
        return "DOWN"

    if pitch > PITCH_DOWN_THRESHOLD:
        return "UP"

    return "CENTER"


# ============================================================
# TEMPORAL STATE
# ============================================================

current_state = "CENTER"
state_start_time = None


def update_temporal_state(new_state):
    global current_state
    global state_start_time

    now = time.time()

    # CENTER resets suspicious timer
    if new_state == "CENTER":

        current_state = "CENTER"
        state_start_time = None

        return {
            "state": "NORMAL",
            "duration": 0.0,
            "suspicious": False,
        }

    # Direction changed
    if new_state != current_state:

        current_state = new_state
        state_start_time = now

        return {
            "state": new_state,
            "duration": 0.0,
            "suspicious": False,
        }

    # Same abnormal direction continues
    if state_start_time is None:
        state_start_time = now

    duration = now - state_start_time

    suspicious = duration >= ALERT_SECONDS

    return {
        "state": new_state,
        "duration": duration,
        "suspicious": suspicious,
    }


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")

print()
print("====================================")
print("HEAD POSE + TEMPORAL DETECTOR")
print("Alert after:", ALERT_SECONDS, "seconds")
print("Q = quit")
print("====================================")


while True:

    ok, frame = cap.read()

    if not ok:
        break

    faces = app.get(frame)

    # ========================================================
    # NO FACE
    # ========================================================

    if len(faces) == 0:

        temporal = update_temporal_state(
            "NO_FACE"
        )

        if temporal["suspicious"]:

            status = (
                f"ALERT: NO FACE "
                f"{temporal['duration']:.1f}s"
            )

            color = (0, 0, 255)

        else:

            status = (
                f"NO FACE "
                f"{temporal['duration']:.1f}s"
            )

            color = (0, 165, 255)

        cv2.putText(
            frame,
            status,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            color,
            2,
        )

    # ========================================================
    # MULTIPLE FACES
    # ========================================================

    elif len(faces) > 1:

        temporal = update_temporal_state(
            "MULTIPLE_FACES"
        )

        if temporal["suspicious"]:

            status = (
                f"ALERT: MULTIPLE FACES "
                f"{temporal['duration']:.1f}s"
            )

            color = (0, 0, 255)

        else:

            status = (
                f"MULTIPLE FACES: {len(faces)} "
                f"{temporal['duration']:.1f}s"
            )

            color = (0, 165, 255)

        cv2.putText(
            frame,
            status,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            color,
            2,
        )

        for face in faces:

            x1, y1, x2, y2 = map(
                int,
                face.bbox
            )

            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                color,
                2,
            )

    # ========================================================
    # ONE FACE
    # ========================================================

    else:

        face = faces[0]

        x1, y1, x2, y2 = map(
            int,
            face.bbox
        )

        pose = face.pose

        if pose is not None and len(pose) >= 3:

            pitch = float(pose[0])
            yaw = float(pose[1])
            roll = float(pose[2])

            direction = classify_direction(
                pitch,
                yaw
            )

            temporal = update_temporal_state(
                direction
            )

            duration = temporal["duration"]
            suspicious = temporal["suspicious"]

            # ------------------------------------------------
            # DISPLAY STATUS
            # ------------------------------------------------

            if direction == "CENTER":

                status = "NORMAL"
                color = (0, 255, 0)

            elif suspicious:

                status = (
                    f"ALERT: {direction} "
                    f"{duration:.1f}s"
                )

                color = (0, 0, 255)

            else:

                status = (
                    f"{direction} "
                    f"{duration:.1f}s"
                )

                color = (0, 165, 255)

            # ------------------------------------------------
            # DRAW FACE
            # ------------------------------------------------

            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                color,
                2,
            )

            cv2.putText(
                frame,
                status,
                (x1, max(30, y1 - 35)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                color,
                2,
            )

            cv2.putText(
                frame,
                f"pitch={pitch:.1f} yaw={yaw:.1f} roll={roll:.1f}",
                (x1, max(30, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
            )

    # ========================================================
    # GLOBAL STATUS
    # ========================================================

    cv2.putText(
        frame,
        f"Alert threshold: {ALERT_SECONDS:.1f}s",
        (20, frame.shape[0] - 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 0),
        1,
    )

    cv2.imshow(
        "AntiCheating2 - Head Behavior",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break


cap.release()
cv2.destroyAllWindows()