import cv2
import mediapipe as mp
from ultralytics import YOLO


# ============================================================
# CONFIG
# ============================================================

OBJECT_MODEL = (
    r"D:\AntiCheating2\runs\objects\module3_yolo11s_v2_phonefix"
    r"\weights\best.pt"
)

HAND_MODEL = (
    r"D:\AntiCheating2\models\hands\hand_landmarker.task"
)

CONF_THRESHOLD = 0.25

# Khoảng cách mở rộng quanh bounding box vật thể
HAND_OBJECT_MARGIN = 30

# Số landmark tay tối thiểu phải nằm gần object
MIN_HAND_POINTS_NEAR_OBJECT = 3


# ============================================================
# LOAD OBJECT DETECTOR
# ============================================================

print("Loading object detector...")

object_model = YOLO(OBJECT_MODEL)

print("Object detector ready.")


# ============================================================
# LOAD MEDIAPIPE HAND LANDMARKER
# ============================================================

print("Loading MediaPipe Hand Landmarker...")

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

hand_options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=HAND_MODEL
    ),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)

hand_landmarker = HandLandmarker.create_from_options(
    hand_options
)

print("MediaPipe Hand Landmarker ready.")


# ============================================================
# HELPERS
# ============================================================

def point_near_box(px, py, box, margin=30):
    """
    Kiểm tra 1 điểm landmark tay có nằm trong
    hoặc gần bounding box vật thể hay không.
    """

    x1, y1, x2, y2 = box

    return (
        x1 - margin <= px <= x2 + margin
        and
        y1 - margin <= py <= y2 + margin
    )


def hand_interacts_with_object(hand_points, box):
    """
    Kiểm tra một bàn tay có đang tương tác
    với bounding box của vật thể hay không.
    """

    hit_count = 0

    for px, py in hand_points:

        if point_near_box(
            px,
            py,
            box,
            HAND_OBJECT_MARGIN,
        ):
            hit_count += 1

    return hit_count >= MIN_HAND_POINTS_NEAR_OBJECT


def get_interaction_label(label):
    """
    Trả về tên trạng thái tương tác theo từng object.
    """

    if label == "mobile_phone":
        return "HOLDING PHONE"

    if label == "study_material":
        return "HOLDING STUDY MATERIAL"

    if label == "tablet":
        return "HOLDING TABLET"

    if label == "laptop":
        return "INTERACTING LAPTOP"

    return f"INTERACTING {label}"


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")


print()
print("====================================")
print("HAND-OBJECT INTERACTION")
print("Q = quit")
print("====================================")


frame_timestamp_ms = 0


while True:

    ok, frame = cap.read()

    if not ok:
       break

# Mirror webcam để hiển thị tự nhiên như gương
    frame = cv2.flip(frame, 1)

    h, w = frame.shape[:2]


    # ========================================================
    # MODULE 3 - OBJECT DETECTION
    # ========================================================

    result = object_model.predict(
        frame,
        imgsz=640,
        conf=CONF_THRESHOLD,
        device=0,
        verbose=False,
    )[0]

    objects = []

    for box in result.boxes:

        cls_id = int(box.cls[0])
        conf = float(box.conf[0])

        label = object_model.names[cls_id]

        x1, y1, x2, y2 = map(
            int,
            box.xyxy[0].tolist()
        )

        objects.append({
            "label": label,
            "conf": conf,
            "box": (
                x1,
                y1,
                x2,
                y2,
            ),
            "interacting": False,
        })


    # ========================================================
    # HAND LANDMARK DETECTION
    # ========================================================

    rgb_frame = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb_frame,
    )

    # VIDEO mode yêu cầu timestamp tăng liên tục
    frame_timestamp_ms += 33

    hand_result = hand_landmarker.detect_for_video(
        mp_image,
        frame_timestamp_ms,
    )

    all_hands = []


    # ========================================================
    # CONVERT HAND LANDMARKS TO PIXELS
    # ========================================================

    if hand_result.hand_landmarks:

        for hand_landmarks in hand_result.hand_landmarks:

            hand_points = []

            for lm in hand_landmarks:

                px = int(lm.x * w)
                py = int(lm.y * h)

                hand_points.append(
                    (px, py)
                )

                # Vẽ landmark
                cv2.circle(
                    frame,
                    (px, py),
                    3,
                    (255, 255, 0),
                    -1,
                )

            all_hands.append(
                hand_points
            )


            # ------------------------------------------------
            # DRAW SIMPLE HAND CONNECTIONS
            # ------------------------------------------------

            connections = [
                (0, 1), (1, 2), (2, 3), (3, 4),

                (0, 5), (5, 6), (6, 7), (7, 8),

                (5, 9), (9, 10), (10, 11), (11, 12),

                (9, 13), (13, 14), (14, 15), (15, 16),

                (13, 17), (17, 18), (18, 19), (19, 20),

                (0, 17),
            ]

            for start_idx, end_idx in connections:

                if (
                    start_idx < len(hand_points)
                    and end_idx < len(hand_points)
                ):

                    cv2.line(
                        frame,
                        hand_points[start_idx],
                        hand_points[end_idx],
                        (255, 255, 0),
                        1,
                    )


    # ========================================================
    # HAND <-> OBJECT INTERACTION
    # ========================================================

    for obj in objects:

        for hand_points in all_hands:

            if hand_interacts_with_object(
                hand_points,
                obj["box"],
            ):

                obj["interacting"] = True
                break


    # ========================================================
    # DRAW OBJECTS + INTERACTION
    # ========================================================

    alerts = []

    for obj in objects:

        x1, y1, x2, y2 = obj["box"]

        label = obj["label"]
        conf = obj["conf"]

        if obj["interacting"]:

            color = (0, 0, 255)

            status = get_interaction_label(
                label
            )

            alerts.append(status)

        else:

            color = (0, 255, 0)
            status = label


        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2,
        )

        cv2.putText(
            frame,
            f"{status} {conf:.2f}",
            (x1, max(25, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )


    # ========================================================
    # GLOBAL STATUS
    # ========================================================

    if alerts:

        global_status = " | ".join(
            sorted(set(alerts))
        )

        global_color = (0, 0, 255)

    else:

        global_status = (
            "NO HAND-OBJECT INTERACTION"
        )

        global_color = (0, 255, 0)


    cv2.putText(
        frame,
        global_status,
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        global_color,
        2,
    )


    # ========================================================
    # DEBUG INFO
    # ========================================================

    cv2.putText(
        frame,
        f"Hands: {len(all_hands)} | Objects: {len(objects)}",
        (20, frame.shape[0] - 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 0),
        1,
    )


    # ========================================================
    # SHOW
    # ========================================================

    cv2.imshow(
        "AntiCheating2 - Hand Object Interaction",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break


# ============================================================
# CLEANUP
# ============================================================

cap.release()
cv2.destroyAllWindows()

hand_landmarker.close()