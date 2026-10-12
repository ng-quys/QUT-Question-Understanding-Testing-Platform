from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis


# ============================================================
# CONFIG
# ============================================================

REFERENCE_IMAGE = Path(
    r"D:\AntiCheating2\Datasets\identity\reference.jpg"
)

LIVENESS_MODEL_PATH = Path(
    r"D:\AntiCheating2\models\liveness\MiniFASNetV2.onnx"
)

FACE_MATCH_THRESHOLD = 0.40
LIVENESS_SCALE = 2.7


# ============================================================
# FACE ANALYSIS
# ============================================================

print("Loading InsightFace...")

face_app = FaceAnalysis(
    name="buffalo_l",
    providers=[
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ],
)

face_app.prepare(
    ctx_id=0,
    det_size=(640, 640),
)

print("InsightFace ready.")


# ============================================================
# LOAD REFERENCE FACE
# ============================================================

if not REFERENCE_IMAGE.exists():
    raise FileNotFoundError(
        f"Reference image not found: {REFERENCE_IMAGE}"
    )

reference_img = cv2.imread(str(REFERENCE_IMAGE))

if reference_img is None:
    raise RuntimeError("Cannot read reference image")

reference_faces = face_app.get(reference_img)

if len(reference_faces) != 1:
    raise RuntimeError(
        f"Reference image must contain exactly 1 face. Found: {len(reference_faces)}"
    )

reference_embedding = reference_faces[0].normed_embedding

print("Reference face loaded.")


# ============================================================
# LIVENESS MODEL
# ============================================================

if not LIVENESS_MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Liveness model not found: {LIVENESS_MODEL_PATH}"
    )

print("Loading liveness model...")

liveness_session = ort.InferenceSession(
    str(LIVENESS_MODEL_PATH),
    providers=[
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ],
)

input_cfg = liveness_session.get_inputs()[0]
input_name = input_cfg.name
input_size = tuple(input_cfg.shape[2:])

output_cfg = liveness_session.get_outputs()[0]
output_name = output_cfg.name

print("Liveness ready.")
print("Providers:", liveness_session.get_providers())


# ============================================================
# HELPERS
# ============================================================

def cosine_similarity(a, b):
    return float(
        np.dot(a, b)
        / (np.linalg.norm(a) * np.linalg.norm(b))
    )


def xyxy_to_xywh(bbox):
    x1, y1, x2, y2 = bbox

    return [
        int(x1),
        int(y1),
        int(x2 - x1),
        int(y2 - y1),
    ]


def crop_face(image, bbox, scale=2.7):
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

    x1 = max(0, int(center_x - new_w / 2))
    y1 = max(0, int(center_y - new_h / 2))
    x2 = min(src_w - 1, int(center_x + new_w / 2))
    y2 = min(src_h - 1, int(center_y + new_h / 2))

    cropped = image[y1:y2 + 1, x1:x2 + 1]

    if cropped.size == 0:
        return None

    cropped = cv2.resize(
        cropped,
        input_size[::-1]
    )

    return cropped


def preprocess_liveness(image, bbox):
    face = crop_face(
        image,
        bbox,
        scale=LIVENESS_SCALE,
    )

    if face is None:
        return None

    face = face.astype(np.float32)
    face = np.transpose(face, (2, 0, 1))
    face = np.expand_dims(face, axis=0)

    return face


def softmax(x):
    e_x = np.exp(
        x - np.max(
            x,
            axis=1,
            keepdims=True
        )
    )

    return e_x / e_x.sum(
        axis=1,
        keepdims=True
    )


def predict_liveness(frame, bbox_xyxy):
    bbox_xywh = xyxy_to_xywh(
        bbox_xyxy
    )

    inp = preprocess_liveness(
        frame,
        bbox_xywh
    )

    if inp is None:
        return None

    outputs = liveness_session.run(
        [output_name],
        {
            input_name: inp
        }
    )

    logits = outputs[0]
    probs = softmax(logits)

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


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")

print()
print("======================================")
print("IDENTITY PIPELINE RUNNING")
print("Q = quit")
print("======================================")

while True:

    ok, frame = cap.read()

    if not ok:
        break

    faces = face_app.get(frame)

    # --------------------------------------------------------
    # NO FACE
    # --------------------------------------------------------

    if len(faces) == 0:

        cv2.putText(
            frame,
            "NO FACE",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 0, 255),
            2,
        )

    # --------------------------------------------------------
    # MULTIPLE FACES
    # --------------------------------------------------------

    elif len(faces) > 1:

        cv2.putText(
            frame,
            f"MULTIPLE FACES: {len(faces)}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 0, 255),
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
                (0, 0, 255),
                2,
            )

    # --------------------------------------------------------
    # ONE FACE
    # --------------------------------------------------------

    else:

        face = faces[0]

        bbox = face.bbox.tolist()

        x1, y1, x2, y2 = map(
            int,
            bbox
        )

        # ================================================
        # STEP 1 — LIVENESS
        # ================================================

        live_result = predict_liveness(
            frame,
            bbox
        )

        if live_result is None:
            continue

        live_label = live_result["label"]
        live_score = live_result["score"]

        # -----------------------------------------------
        # SPOOF → REJECT IMMEDIATELY
        # -----------------------------------------------

        if live_label == "SPOOF":

            status = (
                f"SPOOF REJECTED "
                f"{live_score:.3f}"
            )

            color = (0, 0, 255)

        # -----------------------------------------------
        # REAL → FACE VERIFICATION
        # -----------------------------------------------

        else:

            similarity = cosine_similarity(
                reference_embedding,
                face.normed_embedding,
            )

            if similarity >= FACE_MATCH_THRESHOLD:

                status = (
                    f"VERIFIED "
                    f"sim={similarity:.3f} "
                    f"live={live_score:.3f}"
                )

                color = (0, 255, 0)

            else:

                status = (
                    f"WRONG PERSON "
                    f"sim={similarity:.3f} "
                    f"live={live_score:.3f}"
                )

                color = (0, 0, 255)

        # ================================================
        # DRAW
        # ================================================

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
            (x1, max(30, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            color,
            2,
        )

    cv2.imshow(
        "AntiCheating2 - Identity Pipeline",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break


cap.release()
cv2.destroyAllWindows()