import sys
import os
import time
import json
import queue
import threading
from pathlib import Path
from collections import deque
from runtime_state import publish, fail, install_error_handler

install_error_handler()
publish("loading", "Đang tải thư viện và model")
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import mediapipe as mp
import numpy as np
import onnxruntime as ort
import sounddevice as sd
import webrtcvad

from insightface.app import FaceAnalysis
from ultralytics import YOLO


# ============================================================
# PROJECT PATH
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from src.temporal.temporal_tracker import create_anticheating_tracker
from src.fusion.risk_engine import RiskEngine
from src.evidence.evidence_logger import EvidenceLogger


# ============================================================
# CONFIG
# ============================================================

REFERENCE_IMAGE = Path(os.environ.get(
    "ANTICHEAT_REFERENCE_IMAGE",
    str(PROJECT_ROOT / "student-profiles" / f"{os.environ.get('ANTICHEAT_STUDENT_ID', 'reference')}.jpg")
))
LIVENESS_MODEL = Path(os.environ.get(
    "ANTICHEAT_LIVENESS_MODEL",
    str(PROJECT_ROOT / "models" / "liveness" / "MiniFASNetV2.onnx")
))
PERSON_MODEL = os.environ.get(
    "ANTICHEAT_PERSON_MODEL",
    str(PROJECT_ROOT / "models" / "person" / "yolo11s.pt")
)
CUSTOM_OBJECT_MODEL = PROJECT_ROOT / "models" / "objects" / "best.pt"
OBJECT_MODEL = os.environ.get(
    "ANTICHEAT_OBJECT_MODEL",
    str(CUSTOM_OBJECT_MODEL if CUSTOM_OBJECT_MODEL.exists() else PROJECT_ROOT / "models" / "person" / "yolo11s.pt")
)
HAND_MODEL = os.environ.get(
    "ANTICHEAT_HAND_MODEL",
    str(PROJECT_ROOT / "models" / "hands" / "hand_landmarker.task")
)
ATTEMPT_ID = os.environ.get("ANTICHEAT_ATTEMPT_ID", "")
BACKEND_CALLBACK_URL = os.environ.get(
    "ANTICHEAT_BACKEND_CALLBACK_URL",
    "http://127.0.0.1:8080/api/internal/anticheating/events"
)
INTERNAL_SECRET = os.environ.get("ANTICHEAT_INTERNAL_SECRET", "change-me")
DEVICE = os.environ.get("ANTICHEAT_DEVICE", "cpu")
DEVICE_ARG = "cpu" if DEVICE.lower() == "cpu" else 0


# ============================================================
# DETECTION CONFIG
# ============================================================

FACE_MATCH_THRESHOLD = 0.40
LIVENESS_SCALE = 2.7

PERSON_CONF = 0.40
OBJECT_CONF = 0.25

HAND_OBJECT_MARGIN = 30
MIN_HAND_POINTS_NEAR_OBJECT = 3

# ============================================================
# M5 HYBRID CONFIG
# ============================================================

M5_GRACE_SECONDS = 0.45

M5_FALLBACK_PHONE_SECONDS = 1.20
M5_FALLBACK_STUDY_SECONDS = 1.20

M5_FALLBACK_PHONE_CONF = 0.45
M5_FALLBACK_STUDY_CONF = 0.45

M5_MIN_OBJECT_PERSON_AREA_RATIO = 0.01
M5_MAX_OBJECT_PERSON_AREA_RATIO = 0.35

YAW_THRESHOLD = 20
PITCH_THRESHOLD = 15


# ============================================================
# M1 STABILIZATION CONFIG
# ============================================================

# Số frame gần nhất dùng để voting
M1_VOTE_WINDOW = 10

# Event nguy hiểm phải chắc hơn
SPOOF_VOTE_REQUIRED = 8
MISMATCH_VOTE_REQUIRED = 8

# VERIFIED chỉ cần đa số rõ ràng
VERIFIED_VOTE_REQUIRED = 6

# Làm mượt similarity
SIMILARITY_WINDOW = 10


# ============================================================
# M6 AUDIO CONFIG
# ============================================================

AUDIO_SAMPLE_RATE = 16000
AUDIO_FRAME_MS = 30

AUDIO_SAMPLES_PER_FRAME = int(
    AUDIO_SAMPLE_RATE
    * AUDIO_FRAME_MS
    / 1000
)

AUDIO_VAD_MODE = 2

AUDIO_WINDOW = 10
AUDIO_SPEECH_RATIO = 0.6


# ============================================================
# M7 BROWSER CONFIG
# ============================================================

BROWSER_HOST = "127.0.0.1"
BROWSER_PORT = 8765

browser_events_lock = threading.Lock()

browser_states = {
    "TAB_HIDDEN": False,
    "FULLSCREEN_EXIT": False,
}


# ============================================================
# LOAD M2
# ============================================================

print("Loading M2 Person Detector...")

person_model = YOLO(
    PERSON_MODEL
)

print("M2 ready.")


# ============================================================
# LOAD M3
# ============================================================

print("Loading M3 Object Detector...")

object_model = YOLO(
    OBJECT_MODEL
)

print("M3 ready.")


# ============================================================
# LOAD M1 + M4
# ============================================================

print("Loading M1/M4 InsightFace...")

face_app = FaceAnalysis(
    name="buffalo_l",
    root=str(PROJECT_ROOT / "models" / "identity"),
    providers=["CPUExecutionProvider"] if DEVICE.lower() == "cpu" else ort.get_available_providers(),
)

face_app.prepare(
    ctx_id=-1 if DEVICE.lower() == "cpu" else 0,
    det_size=(640, 640),
)

print("InsightFace ready.")


# ============================================================
# M1 REFERENCE FACE
# ============================================================

reference_img = cv2.imread(
    str(REFERENCE_IMAGE)
)

if reference_img is None:
    raise RuntimeError(
        "Cannot read reference image"
    )

reference_faces = face_app.get(
    reference_img
)

if len(reference_faces) != 1:
    raise RuntimeError(
        "Reference image must contain exactly one face"
    )

reference_embedding = (
    reference_faces[0].normed_embedding
)

print("M1 reference ready.")


# ============================================================
# M1 LIVENESS MODEL
# ============================================================

print("Loading M1 Liveness...")

liveness_session = ort.InferenceSession(
    str(LIVENESS_MODEL),
    providers=["CPUExecutionProvider"] if DEVICE.lower() == "cpu" else ort.get_available_providers(),
)

live_input = (
    liveness_session.get_inputs()[0]
)

live_input_name = (
    live_input.name
)

live_input_size = tuple(
    live_input.shape[2:]
)

live_output_name = (
    liveness_session.get_outputs()[0].name
)

print("M1 Liveness ready.")


# ============================================================
# M5 HAND LANDMARKER
# ============================================================

print("Loading M5 Hand Landmarker...")

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode

hand_options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=HAND_MODEL
    ),
    running_mode=RunningMode.VIDEO,
    num_hands=2,
    min_hand_detection_confidence=0.35,
    min_hand_presence_confidence=0.35,
    min_tracking_confidence=0.35,
)

hand_landmarker = (
    HandLandmarker.create_from_options(
        hand_options
    )
)

print("M5 ready.")


# ============================================================
# M8 + M9 + M10
# ============================================================

print("Loading M8 Temporal Tracker...")
temporal = create_anticheating_tracker()

print("Loading M9 Risk Engine...")
risk_engine = RiskEngine()

print("Loading M10 Evidence Logger...")
evidence_logger = EvidenceLogger()

print("M8 + M9 + M10 ready.")


# ============================================================
# M1 VOTING BUFFERS
# ============================================================

spoof_history = deque(
    maxlen=M1_VOTE_WINDOW
)

mismatch_history = deque(
    maxlen=M1_VOTE_WINDOW
)

verified_history = deque(
    maxlen=M1_VOTE_WINDOW
)

similarity_history = deque(
    maxlen=SIMILARITY_WINDOW
)


# ============================================================
# M5 HYBRID STATE
# ============================================================

m5_last_confirmed = {
    "HOLDING_PHONE": None,
    "HOLDING_STUDY_MATERIAL": None,
    "HOLDING_TABLET": None,
}

m5_fallback_start = {
    "HOLDING_PHONE": None,
    "HOLDING_STUDY_MATERIAL": None,
    "HOLDING_TABLET": None,
}


# ============================================================
# HELPERS
# ============================================================

def cosine_similarity(a, b):

    return float(
        np.dot(a, b)
        /
        (
            np.linalg.norm(a)
            * np.linalg.norm(b)
        )
    )


def xyxy_to_xywh(bbox):

    x1, y1, x2, y2 = bbox

    return [
        int(x1),
        int(y1),
        int(x2 - x1),
        int(y2 - y1),
    ]


def crop_live_face(
    image,
    bbox,
    scale=LIVENESS_SCALE,
):

    src_h, src_w = image.shape[:2]

    x, y, box_w, box_h = bbox

    if box_w <= 0 or box_h <= 0:
        return None

    scale = min(
        (src_h - 1) / box_h,
        (src_w - 1) / box_w,
        scale,
    )

    new_w = box_w * scale
    new_h = box_h * scale

    center_x = x + box_w / 2
    center_y = y + box_h / 2

    x1 = max(
        0,
        int(center_x - new_w / 2)
    )

    y1 = max(
        0,
        int(center_y - new_h / 2)
    )

    x2 = min(
        src_w - 1,
        int(center_x + new_w / 2)
    )

    y2 = min(
        src_h - 1,
        int(center_y + new_h / 2)
    )

    cropped = image[
        y1:y2 + 1,
        x1:x2 + 1
    ]

    if cropped.size == 0:
        return None

    return cv2.resize(
        cropped,
        live_input_size[::-1]
    )


def predict_liveness(
    frame,
    bbox_xyxy,
):

    bbox_xywh = xyxy_to_xywh(
        bbox_xyxy
    )

    face = crop_live_face(
        frame,
        bbox_xywh
    )

    if face is None:
        return None

    face = face.astype(
        np.float32
    )

    face = np.transpose(
        face,
        (2, 0, 1)
    )

    face = np.expand_dims(
        face,
        axis=0
    )

    output = liveness_session.run(
        [live_output_name],
        {
            live_input_name: face
        }
    )[0]

    exp_x = np.exp(
        output
        - np.max(
            output,
            axis=1,
            keepdims=True
        )
    )

    probs = (
        exp_x
        /
        exp_x.sum(
            axis=1,
            keepdims=True
        )
    )

    class_id = int(
        np.argmax(probs)
    )

    score = float(
        probs[0, class_id]
    )

    label = (
        "REAL"
        if class_id == 1
        else "SPOOF"
    )

    return {
        "label": label,
        "score": score,
        "class_id": class_id,
    }


def classify_head_direction(
    pitch,
    yaw,
):

    if yaw > YAW_THRESHOLD:
        return "RIGHT"

    if yaw < -YAW_THRESHOLD:
        return "LEFT"

    if pitch < -PITCH_THRESHOLD:
        return "DOWN"

    if pitch > PITCH_THRESHOLD:
        return "UP"

    return "CENTER"


def point_near_box(
    px,
    py,
    box,
    margin,
):

    x1, y1, x2, y2 = box

    return (
        x1 - margin <= px <= x2 + margin
        and
        y1 - margin <= py <= y2 + margin
    )


def hand_interacts_with_object(
    hand_points,
    box,
):

    count = 0

    for px, py in hand_points:

        if point_near_box(
            px,
            py,
            box,
            HAND_OBJECT_MARGIN,
        ):

            count += 1

    return (
        count
        >= MIN_HAND_POINTS_NEAR_OBJECT
    )


def interaction_event_name(label):

    if label == "mobile_phone":
        return "HOLDING_PHONE"

    if label == "study_material":
        return "HOLDING_STUDY_MATERIAL"

    if label == "tablet":
        return "HOLDING_TABLET"

    if label == "laptop":
        return "INTERACTING_LAPTOP"

    return None


def box_center(box):

    x1, y1, x2, y2 = box

    return (
        (x1 + x2) / 2,
        (y1 + y2) / 2,
    )


def point_inside_box(
    point,
    box,
    margin=0,
):

    px, py = point

    x1, y1, x2, y2 = box

    return (
        x1 - margin <= px <= x2 + margin
        and
        y1 - margin <= py <= y2 + margin
    )


def person_is_inside_phone(
    person_box,
    phone_boxes,
):

    center = box_center(
        person_box
    )

    for phone_box in phone_boxes:

        if point_inside_box(
            center,
            phone_box,
            margin=20,
        ):
            return True

    return False


def box_area(box):

    x1, y1, x2, y2 = box

    return max(0, x2 - x1) * max(0, y2 - y1)


def intersection_area(box_a, box_b):

    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    x1 = max(ax1, bx1)
    y1 = max(ay1, by1)
    x2 = min(ax2, bx2)
    y2 = min(ay2, by2)

    return max(0, x2 - x1) * max(0, y2 - y1)


def object_near_person_for_fallback(
    object_box,
    person_boxes,
):

    if not person_boxes:
        return False

    obj_area = box_area(object_box)

    if obj_area <= 0:
        return False

    ox, oy = box_center(object_box)

    for person_box in person_boxes:

        px1, py1, px2, py2 = person_box

        person_area = box_area(person_box)

        if person_area <= 0:
            continue

        area_ratio = obj_area / person_area

        if not (
            M5_MIN_OBJECT_PERSON_AREA_RATIO
            <= area_ratio
            <= M5_MAX_OBJECT_PERSON_AREA_RATIO
        ):
            continue

        person_w = max(1, px2 - px1)
        person_h = max(1, py2 - py1)

        margin_x = int(person_w * 0.10)
        margin_y = int(person_h * 0.05)

        inside_expanded = (
            px1 - margin_x <= ox <= px2 + margin_x
            and
            py1 - margin_y <= oy <= py2 + margin_y
        )

        if not inside_expanded:
            continue

        relative_y = (oy - py1) / person_h

        if relative_y < 0.18:
            continue

        inter = intersection_area(
            object_box,
            person_box
        )

        overlap_ratio = (
            inter / obj_area
            if obj_area > 0
            else 0.0
        )

        near_side = (
            abs(ox - px1) <= person_w * 0.18
            or
            abs(ox - px2) <= person_w * 0.18
        )

        if overlap_ratio >= 0.10 or near_side:
            return True

    return False


def vote_ready(history):

    return (
        len(history)
        >= M1_VOTE_WINDOW
    )


# ============================================================
# M6 AUDIO THREAD
# ============================================================

audio_speech_active = False
audio_ready = threading.Event()
audio_error = None
audio_lock = threading.Lock()


def audio_worker():

    global audio_speech_active, audio_error

    vad = webrtcvad.Vad(
        AUDIO_VAD_MODE
    )

    history = deque(
        maxlen=AUDIO_WINDOW
    )

    audio_queue = queue.Queue()


    def callback(
        indata,
        frames,
        time_info,
        status,
    ):

        audio_queue.put(
            indata.copy()
        )


    try:

        with sd.InputStream(
            samplerate=AUDIO_SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=AUDIO_SAMPLES_PER_FRAME,
            callback=callback,
        ):

            audio_ready.set()
            print("M6 Audio running.")

            while True:

                audio = audio_queue.get(timeout=5)

                samples = audio[:, 0]

                pcm16 = (
                    np.clip(
                        samples,
                        -1,
                        1
                    )
                    * 32767
                ).astype(
                    np.int16
                )

                is_speech = vad.is_speech(
                    pcm16.tobytes(),
                    AUDIO_SAMPLE_RATE,
                )

                history.append(
                    1 if is_speech else 0
                )

                if not history:
                    continue

                ratio = (
                    sum(history)
                    / len(history)
                )

                with audio_lock:

                    audio_speech_active = (
                        ratio
                        >= AUDIO_SPEECH_RATIO
                    )

    except Exception as exc:

        audio_error = str(exc)
        fail("Micro không hoạt động: " + str(exc))
        print(
            "M6 Audio error:",
            exc
        )


audio_thread = threading.Thread(
    target=audio_worker,
    daemon=True,
)

audio_thread.start()


# ============================================================
# M7 BROWSER EVENT SERVER
# ============================================================

class BrowserHandler(
    BaseHTTPRequestHandler
):

    def _cors(self):

        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )


    def do_OPTIONS(self):

        self.send_response(200)
        self._cors()
        self.end_headers()


    def do_POST(self):

        if self.path != "/event":

            self.send_response(404)
            self.end_headers()
            return

        length = int(
            self.headers.get(
                "Content-Length",
                0
            )
        )

        raw = self.rfile.read(
            length
        )

        try:

            data = json.loads(
                raw.decode(
                    "utf-8"
                )
            )

            event = data.get(
                "event"
            )

            active = bool(
                data.get(
                    "active",
                    True
                )
            )

            if event in browser_states:

                with browser_events_lock:

                    browser_states[
                        event
                    ] = active

            self.send_response(200)
            self._cors()
            self.end_headers()

            self.wfile.write(
                b"OK"
            )

        except Exception:

            self.send_response(400)
            self._cors()
            self.end_headers()


    def log_message(
        self,
        format,
        *args
    ):
        return


def browser_server_worker():

    try:

        server = ThreadingHTTPServer(
            (
                BROWSER_HOST,
                BROWSER_PORT
            ),
            BrowserHandler,
        )

        print(
            f"M7 Browser bridge running at "
            f"http://{BROWSER_HOST}:{BROWSER_PORT}"
        )

        server.serve_forever()

    except Exception as exc:

        print(
            "M7 Browser error:",
            exc
        )


browser_thread = threading.Thread(
    target=browser_server_worker,
    daemon=True,
)

browser_thread.start()


# ============================================================
# TRACKED EVENTS
# ============================================================

TRACKED_EVENT_NAMES = [
    "NO_FACE",
    "MULTIPLE_PEOPLE",

    "SPOOF_FACE",
    "IDENTITY_MISMATCH",

    "HEAD_LEFT",
    "HEAD_RIGHT",
    "HEAD_UP",
    "HEAD_DOWN",

    "HOLDING_PHONE",
    "HOLDING_STUDY_MATERIAL",
    "HOLDING_TABLET",

    "SPEECH",

    "TAB_HIDDEN",
    "FULLSCREEN_EXIT",
]


# ============================================================
# BACKEND EVENT CALLBACK
# ============================================================

def post_backend_event(payload):
    if not ATTEMPT_ID:
        return
    try:
        import urllib.request
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            BACKEND_CALLBACK_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-AntiCheat-Secret": INTERNAL_SECRET,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            response.read()
    except Exception as exc:
        print("Backend callback warning:", exc)


# ============================================================
# CAMERA
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():

    raise RuntimeError(
        "Không mở được webcam. Hãy đóng ứng dụng đang dùng camera và kiểm tra quyền camera."
    )


if not audio_ready.wait(timeout=10) or audio_error:
    raise RuntimeError("Không khởi động được micro: " + str(audio_error or "hết thời gian chờ"))

start_time = time.monotonic()

last_timestamp_ms = 0


print()
print("======================================")
print("ANTICHEATING2 - FULL 10 MODULES")
print("======================================")
print("M1  Identity + Liveness")
print("M2  Person")
print("M3  Objects")
print("M4  Head Pose")
print("M5  Hand-Object")
print("M6  Audio VAD")
print("M7  Browser")
print("M8  Temporal")
print("M9  Risk Engine")
print("M10 Evidence")
print("======================================")
print()


# ============================================================
# MAIN LOOP
# ============================================================

while True:

    ok, frame = cap.read()

    if not ok:
        raise RuntimeError("Webcam ngừng cung cấp hình ảnh")

    frame = cv2.flip(
        frame,
        1
    )

    # Frame sạch để model xử lý.
    # Không cho bounding box/text ảnh hưởng model khác.
    analysis_frame = frame.copy()

    h, w = frame.shape[:2]


    # ========================================================
    # M3 OBJECTS
    # ========================================================

    object_result = (
        object_model.predict(
            analysis_frame,
            imgsz=640,
            conf=OBJECT_CONF,
            device=DEVICE_ARG,
            verbose=False,
        )[0]
    )

    objects = []
    phone_boxes = []

    for box in object_result.boxes:

        cls_id = int(
            box.cls[0]
        )

        conf = float(
            box.conf[0]
        )

        label = (
            object_model.names[
                cls_id
            ]
        )

        bbox = tuple(
            map(
                int,
                box.xyxy[0].tolist()
            )
        )

        objects.append({
            "label": label,
            "conf": conf,
            "box": bbox,
            "interacting": False,
        })

        if label == "mobile_phone":

            phone_boxes.append(
                bbox
            )


    # ========================================================
    # M2 PERSON
    # ========================================================

    person_result = (
        person_model.predict(
            analysis_frame,
            classes=[0],
            conf=PERSON_CONF,
            device=DEVICE_ARG,
            verbose=False,
        )[0]
    )

    valid_person_boxes = []

    for box in person_result.boxes:

        bbox = tuple(
            map(
                int,
                box.xyxy[0].tolist()
            )
        )

        conf = float(
            box.conf[0]
        )

        if person_is_inside_phone(
            bbox,
            phone_boxes,
        ):

            color = (
                128,
                128,
                128
            )

            text = (
                "SCREEN PERSON"
            )

        else:

            valid_person_boxes.append(
                bbox
            )

            color = (
                255,
                200,
                0
            )

            text = (
                f"person {conf:.2f}"
            )

        x1, y1, x2, y2 = bbox

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2,
        )

        cv2.putText(
            frame,
            text,
            (
                x1,
                max(25, y1 - 10)
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
        )


    person_count = len(
        valid_person_boxes
    )


    # ========================================================
    # M1 + M4
    # ========================================================

    faces = face_app.get(
        analysis_frame
    )

    head_direction = "NO_FACE"

    frame_spoof = False
    frame_verified = False
    frame_mismatch = False

    real_similarities = []

    best_verified_face = None
    best_verified_similarity = -1.0


    # --------------------------------------------------------
    # PROCESS RAW FACE RESULTS
    # --------------------------------------------------------

    for face in faces:

        bbox = face.bbox.tolist()

        live_result = predict_liveness(
            analysis_frame,
            bbox
        )

        if live_result is None:
            continue


        if (
            live_result["label"]
            == "SPOOF"
        ):

            frame_spoof = True

        else:

            similarity = (
                cosine_similarity(
                    reference_embedding,
                    face.normed_embedding
                )
            )

            real_similarities.append(
                similarity
            )


            if (
                similarity
                >= FACE_MATCH_THRESHOLD
            ):

                frame_verified = True

                if (
                    similarity
                    > best_verified_similarity
                ):

                    best_verified_similarity = (
                        similarity
                    )

                    best_verified_face = face


    # Nếu có REAL face nhưng không có face nào match
    if (
        real_similarities
        and not frame_verified
    ):

        frame_mismatch = True


    # ========================================================
    # M1 VOTING
    # ========================================================

    spoof_history.append(
        1 if frame_spoof else 0
    )

    mismatch_history.append(
        1 if frame_mismatch else 0
    )

    verified_history.append(
        1 if frame_verified else 0
    )


    if real_similarities:

        similarity_history.append(
            max(real_similarities)
        )


    spoof_votes = sum(
        spoof_history
    )

    mismatch_votes = sum(
        mismatch_history
    )

    verified_votes = sum(
        verified_history
    )


    stable_spoof = (
        vote_ready(spoof_history)
        and
        spoof_votes
        >= SPOOF_VOTE_REQUIRED
    )

    stable_mismatch = (
        vote_ready(mismatch_history)
        and
        mismatch_votes
        >= MISMATCH_VOTE_REQUIRED
    )

    stable_verified = (
        vote_ready(verified_history)
        and
        verified_votes
        >= VERIFIED_VOTE_REQUIRED
    )


    smoothed_similarity = None

    if similarity_history:

        smoothed_similarity = float(
            np.median(
                np.array(
                    similarity_history,
                    dtype=np.float32
                )
            )
        )


    # ========================================================
    # STABLE IDENTITY STATUS
    # ========================================================

    if len(faces) == 0:

        identity_status = "NO_FACE"

    elif stable_mismatch:

        identity_status = (
            "WRONG_PERSON"
        )

    elif stable_verified:

        identity_status = (
            "VERIFIED"
        )

    elif stable_spoof:

        identity_status = (
            "SPOOF"
        )

    else:

        identity_status = (
            "CHECKING"
        )


    # ========================================================
    # M4 HEAD POSE
    # ========================================================

    # Head pose ưu tiên verified face hiện tại.
    # Nếu voting đã VERIFIED nhưng frame hiện tại
    # bị nhiễu liveness thì không tạo head event giả.

    if best_verified_face is not None:

        pose = (
            best_verified_face.pose
        )

        if (
            pose is not None
            and len(pose) >= 3
        ):

            pitch = float(
                pose[0]
            )

            yaw = float(
                pose[1]
            )

            head_direction = (
                classify_head_direction(
                    pitch,
                    yaw,
                )
            )


    # ========================================================
    # DRAW FACES
    # ========================================================

    for face in faces:

        bbox = face.bbox.tolist()

        x1, y1, x2, y2 = map(
            int,
            bbox
        )


        if identity_status == "VERIFIED":

            color = (
                0,
                255,
                0
            )

            if smoothed_similarity is not None:

                text = (
                    f"VERIFIED "
                    f"{smoothed_similarity:.2f}"
                )

            else:

                text = "VERIFIED"


        elif identity_status == "WRONG_PERSON":

            color = (
                0,
                0,
                255
            )

            text = (
                "WRONG PERSON"
            )


        elif identity_status == "SPOOF":

            color = (
                0,
                0,
                255
            )

            text = (
                f"SPOOF "
                f"{spoof_votes}/{M1_VOTE_WINDOW}"
            )


        elif identity_status == "NO_FACE":

            color = (
                0,
                0,
                255
            )

            text = (
                "NO FACE"
            )


        else:

            color = (
                0,
                165,
                255
            )

            text = (
                f"CHECKING "
                f"R:{verified_votes} "
                f"S:{spoof_votes}"
            )


        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2,
        )

        cv2.putText(
            frame,
            text,
            (
                x1,
                max(25, y1 - 10)
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            color,
            2,
        )


    # ========================================================
    # M5 HANDS
    # ========================================================

    rgb = cv2.cvtColor(
        analysis_frame,
        cv2.COLOR_BGR2RGB
    )

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb,
    )

    timestamp_ms = int(
        (
            time.monotonic()
            - start_time
        )
        * 1000
    )

    if timestamp_ms <= last_timestamp_ms:

        timestamp_ms = (
            last_timestamp_ms
            + 1
        )

    last_timestamp_ms = (
        timestamp_ms
    )

    hand_result = (
        hand_landmarker.detect_for_video(
            mp_image,
            timestamp_ms,
        )
    )

    all_hands = []

    if hand_result.hand_landmarks:

        for landmarks in (
            hand_result.hand_landmarks
        ):

            hand_points = []

            for lm in landmarks:

                px = int(
                    lm.x * w
                )

                py = int(
                    lm.y * h
                )

                hand_points.append(
                    (px, py)
                )

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


    # ========================================================
    # M5 HYBRID HAND <-> OBJECT
    # ========================================================

    now_monotonic = time.monotonic()

    interaction_events = []

    fallback_candidate_events = set()

    # --------------------------------------------------------
    # LEVEL 1: CONFIRMED BY HAND LANDMARKS
    # --------------------------------------------------------

    for obj in objects:

        event_name = (
            interaction_event_name(
                obj["label"]
            )
        )

        if event_name is None:
            continue

        confirmed_by_hand = False

        for hand_points in all_hands:

            if hand_interacts_with_object(
                hand_points,
                obj["box"],
            ):

                confirmed_by_hand = True
                break

        if confirmed_by_hand:

            obj["interacting"] = True
            obj["interaction_mode"] = "HAND"

            interaction_events.append(
                event_name
            )

            if event_name in m5_last_confirmed:

                m5_last_confirmed[
                    event_name
                ] = now_monotonic

            if event_name in m5_fallback_start:

                m5_fallback_start[
                    event_name
                ] = None

            continue

        # ----------------------------------------------------
        # LEVEL 2: FALLBACK WHEN HANDS ARE MISSED
        # ----------------------------------------------------

        if len(all_hands) == 0:

            label = obj["label"]
            conf = obj["conf"]

            fallback_allowed = False
            required_seconds = None

            if (
                label == "mobile_phone"
                and conf >= M5_FALLBACK_PHONE_CONF
            ):

                fallback_allowed = True
                required_seconds = (
                    M5_FALLBACK_PHONE_SECONDS
                )

            elif (
                label == "study_material"
                and conf >= M5_FALLBACK_STUDY_CONF
            ):

                fallback_allowed = True
                required_seconds = (
                    M5_FALLBACK_STUDY_SECONDS
                )

            elif (
                label == "tablet"
                and conf >= M5_FALLBACK_PHONE_CONF
            ):

                fallback_allowed = True
                required_seconds = (
                    M5_FALLBACK_PHONE_SECONDS
                )

            if (
                fallback_allowed
                and object_near_person_for_fallback(
                    obj["box"],
                    valid_person_boxes,
                )
            ):

                fallback_candidate_events.add(
                    event_name
                )

                if (
                    m5_fallback_start[
                        event_name
                    ]
                    is None
                ):

                    m5_fallback_start[
                        event_name
                    ] = now_monotonic

                fallback_duration = (
                    now_monotonic
                    - m5_fallback_start[
                        event_name
                    ]
                )

                if (
                    fallback_duration
                    >= required_seconds
                ):

                    obj["interacting"] = True
                    obj["interaction_mode"] = "FALLBACK"

                    interaction_events.append(
                        event_name
                    )

                    m5_last_confirmed[
                        event_name
                    ] = now_monotonic

                else:

                    obj["interaction_mode"] = (
                        "POSSIBLE"
                    )

            else:

                obj["interaction_mode"] = (
                    "NONE"
                )

        else:

            obj["interaction_mode"] = (
                "NONE"
            )

    # --------------------------------------------------------
    # RESET FALLBACK TIMERS THAT DISAPPEARED
    # --------------------------------------------------------

    for event_name in m5_fallback_start:

        if (
            event_name
            not in fallback_candidate_events
        ):

            m5_fallback_start[
                event_name
            ] = None

    # --------------------------------------------------------
    # LEVEL 3: GRACE PERIOD
    # --------------------------------------------------------

    for event_name, last_seen in (
        m5_last_confirmed.items()
    ):

        if last_seen is None:
            continue

        if event_name in interaction_events:
            continue

        elapsed = (
            now_monotonic
            - last_seen
        )

        if elapsed <= M5_GRACE_SECONDS:

            interaction_events.append(
                event_name
            )

    interaction_events = list(
        dict.fromkeys(
            interaction_events
        )
    )


    # ========================================================
    # RAW EVENTS
    # ========================================================

    raw_events = set()


    # ========================================================
    # M1 EVENTS - NOW STABILIZED
    # ========================================================

    if stable_spoof:

        raw_events.add(
            "SPOOF_FACE"
        )

    if stable_mismatch:

        raw_events.add(
            "IDENTITY_MISMATCH"
        )


    # ========================================================
    # M2
    # ========================================================

    if person_count > 1:

        raw_events.add(
            "MULTIPLE_PEOPLE"
        )


    # ========================================================
    # M4
    # ========================================================

    if head_direction == "LEFT":

        raw_events.add(
            "HEAD_LEFT"
        )

    elif head_direction == "RIGHT":

        raw_events.add(
            "HEAD_RIGHT"
        )

    elif head_direction == "UP":

        raw_events.add(
            "HEAD_UP"
        )

    elif head_direction == "DOWN":

        raw_events.add(
            "HEAD_DOWN"
        )


    if len(faces) == 0:

        raw_events.add(
            "NO_FACE"
        )


    # ========================================================
    # M5
    # ========================================================

    for event_name in interaction_events:

        raw_events.add(
            event_name
        )


    # ========================================================
    # M6 AUDIO
    # ========================================================

    with audio_lock:

        speech_now = (
            audio_speech_active
        )

    if speech_now:

        raw_events.add(
            "SPEECH"
        )


    # ========================================================
    # M7 BROWSER
    # ========================================================

    with browser_events_lock:

        browser_tab_hidden = (
            browser_states[
                "TAB_HIDDEN"
            ]
        )

        browser_fullscreen_exit = (
            browser_states[
                "FULLSCREEN_EXIT"
            ]
        )


    if browser_tab_hidden:

        raw_events.add(
            "TAB_HIDDEN"
        )


    if browser_fullscreen_exit:

        raw_events.add(
            "FULLSCREEN_EXIT"
        )


    # ========================================================
    # M8 TEMPORAL
    # ========================================================

    triggered_events = []

    just_triggered_events = []

    temporal_results = {}


    for event_name in (
        TRACKED_EVENT_NAMES
    ):

        detected = (
            event_name
            in raw_events
        )

        result = temporal.update(
            event_name,
            detected
        )

        temporal_results[
            event_name
        ] = result


        if result.get(
            "triggered",
            False
        ):

            triggered_events.append(
                event_name
            )


        if result.get(
            "just_triggered",
            False
        ):

            just_triggered_events.append(
                event_name
            )


    # ========================================================
    # M9 RISK
    # ========================================================

    risk_result = (
        risk_engine.calculate(
            triggered_events
        )
    )


    # ========================================================
    # M10 EVIDENCE
    # ========================================================

    for event_name in (
        just_triggered_events
    ):

        result = temporal_results[
            event_name
        ]

        evidence_data = evidence_logger.log_event(
            event_name=event_name,
            duration=result["duration"],
            risk_score=risk_result.score,
            risk_level=risk_result.level,
            source_module="full_pipeline_voting",
            frame=frame,
        )
        post_backend_event({
            "attemptId": int(ATTEMPT_ID),
            "event": event_name,
            "module": "M10",
            "active": True,
            "timestamp": evidence_data.get("timestamp") if evidence_data else None,
            "duration": float(result["duration"]),
            "riskScore": int(risk_result.score),
            "riskLevel": risk_result.level,
            "sourceModule": "full_pipeline_voting",
            "evidencePath": evidence_data.get("evidence_image") if evidence_data else None,
        })


    # ========================================================
    # DRAW OBJECTS
    # ========================================================

    for obj in objects:

        x1, y1, x2, y2 = (
            obj["box"]
        )

        interaction_mode = obj.get(
            "interaction_mode",
            "NONE"
        )

        if obj["interacting"]:

            color = (
                0,
                0,
                255
            )

            base_event = (
                interaction_event_name(
                    obj["label"]
                )
                or obj["label"]
            )

            if interaction_mode == "FALLBACK":

                text = (
                    f"{base_event}*"
                )

            else:

                text = base_event

        elif interaction_mode == "POSSIBLE":

            color = (
                0,
                165,
                255
            )

            if obj["label"] == "mobile_phone":

                text = (
                    "POSSIBLE_PHONE_HOLD"
                )

            elif obj["label"] == "study_material":

                text = (
                    "POSSIBLE_STUDY_HOLD"
                )

            elif obj["label"] == "tablet":

                text = (
                    "POSSIBLE_TABLET_HOLD"
                )

            else:

                text = obj["label"]

        else:

            color = (
                0,
                255,
                0
            )

            text = (
                obj["label"]
            )


        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2,
        )

        cv2.putText(
            frame,
            (
                f"{text} "
                f"{obj['conf']:.2f}"
            ),
            (
                x1,
                max(25, y1 - 10)
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            color,
            2,
        )


    


    # ========================================================
    # PANEL CONTENT
    # ========================================================

    if objects:

        object_summary = ", ".join(
            sorted(
                set(
                    obj["label"]
                    for obj in objects
                )
            )
        )

    else:

        object_summary = "None"


    if (
        browser_tab_hidden
        or browser_fullscreen_exit
    ):

        browser_text_parts = []

        if browser_tab_hidden:

            browser_text_parts.append(
                "TAB"
            )

        if browser_fullscreen_exit:

            browser_text_parts.append(
                "FS"
            )

        browser_text = ",".join(
            browser_text_parts
        )

    else:

        browser_text = "OK"


    panel_lines = [
        (
            f"M1 Identity: {identity_status}",
            (
                0,
                255,
                0
            )
            if identity_status == "VERIFIED"
            else (
                0,
                165,
                255
            )
            if identity_status == "CHECKING"
            else (
                0,
                0,
                255
            )
        ),

        (
            f"M2 Persons: {person_count}",
            (
                0,
                255,
                0
            )
            if person_count == 1
            else (
                0,
                0,
                255
            )
        ),

        (
            f"M3 Objects: {object_summary}",
            (
                255,
                255,
                0
            )
        ),

        (
            f"M4 Head: {head_direction}",
            (
                0,
                255,
                0
            )
            if head_direction == "CENTER"
            else (
                0,
                165,
                255
            )
        ),

        (
            f"M5 Hands: {len(all_hands)}",
            (
                255,
                255,
                0
            )
        ),

        (
            f"M6 Speech: {speech_now}",
            (
                0,
                0,
                255
            )
            if speech_now
            else (
                0,
                255,
                0
            )
        ),

        (
            f"M7 Browser: {browser_text}",
            (
                0,
                255,
                0
            )
            if browser_text == "OK"
            else (
                0,
                0,
                255
            )
        ),

        (
            "M8 Events: "
            + (
                ", ".join(
                    triggered_events
                )
                if triggered_events
                else "None"
            ),
            (
                0,
                165,
                255
            )
            if triggered_events
            else (
                0,
                255,
                0
            )
        ),

        (
            f"M9 Risk: "
            f"{risk_result.score}/100 "
            f"{risk_result.level}",
            {
                "LOW": (
                    0,
                    255,
                    0
                ),

                "MEDIUM": (
                    0,
                    255,
                    255
                ),

                "HIGH": (
                    0,
                    165,
                    255
                ),

                "CRITICAL": (
                    0,
                    0,
                    255
                ),

            }.get(
                risk_result.level,
                (
                    255,
                    255,
                    255
                )
            )
        ),

        (
            "M10 Evidence: AUTO",
            (
                255,
                255,
                255
            )
        ),
    ]


    y = 28
    gap = 25


    for text, color in panel_lines:

        cv2.putText(
            frame,
            text,
            (
                15,
                y
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            color,
            2,
        )

        y += gap


    # ========================================================
    # SHOW
    # ========================================================

    if audio_error or not audio_thread.is_alive() or not browser_thread.is_alive():
        raise RuntimeError("Micro hoặc browser bridge đã ngừng hoạt động")
    cv2.imshow(
        "AntiCheating2 - FULL 10 MODULES",
        frame
    )
    publish("ready", "AI đang giám sát camera và micro")

    key = (
        cv2.waitKey(1)
        & 0xFF
    )

    if key == ord("q"):
        break


# ============================================================
# CLEANUP
# ============================================================

cap.release()

cv2.destroyAllWindows()

hand_landmarker.close()

print()
publish("stopped", "Giám sát đã dừng")
print("Full AntiCheating2 stopped.")