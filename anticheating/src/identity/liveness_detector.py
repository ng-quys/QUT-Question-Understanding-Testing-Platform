from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis


# ============================================================
# CONFIG
# ============================================================

MODEL_PATH = Path(
    r"D:\AntiCheating2\models\liveness\MiniFASNetV2.onnx"
)

CROP_SCALE = 2.7


# ============================================================
# FACE DETECTOR
# ============================================================

print("Loading face detector...")

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

print("Face detector ready.")


# ============================================================
# ANTI-SPOOFING MODEL
# ============================================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(MODEL_PATH)

print("Loading MiniFASNetV2...")

session = ort.InferenceSession(
    str(MODEL_PATH),
    providers=[
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ],
)

input_cfg = session.get_inputs()[0]
input_name = input_cfg.name
input_size = tuple(input_cfg.shape[2:])

output_cfg = session.get_outputs()[0]
output_name = output_cfg.name

print("Model ready.")
print("Input:", input_name)
print("Input size:", input_size)
print("Output:", output_name)
print("Providers:", session.get_providers())


# ============================================================
# UTILS - MATCH REPO IMPLEMENTATION
# ============================================================

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

    # Repo:
    # input_size = (H, W)
    # cv2.resize expects (W, H)
    cropped = cv2.resize(
        cropped,
        input_size[::-1]
    )

    return cropped


def preprocess(image, bbox):

    face = crop_face(
        image,
        bbox,
        scale=CROP_SCALE,
    )

    if face is None:
        return None

    # IMPORTANT:
    # Repo does NOT RGB convert
    # Repo does NOT divide by 255
    face = face.astype(np.float32)

    face = np.transpose(
        face,
        (2, 0, 1)
    )

    face = np.expand_dims(
        face,
        axis=0
    )

    return face


def softmax(x):

    exp_x = np.exp(
        x - np.max(
            x,
            axis=1,
            keepdims=True
        )
    )

    return exp_x / exp_x.sum(
        axis=1,
        keepdims=True
    )


def predict_liveness(frame, bbox_xyxy):

    bbox_xywh = xyxy_to_xywh(
        bbox_xyxy
    )

    inp = preprocess(
        frame,
        bbox_xywh
    )

    if inp is None:
        return None

    outputs = session.run(
        [output_name],
        {
            input_name: inp
        }
    )

    logits = outputs[0]

    probabilities = softmax(logits)

    label_idx = int(
        np.argmax(probabilities)
    )

    score = float(
        probabilities[0, label_idx]
    )

    # Official repo convention:
    # index 1 = REAL
    # other indexes = FAKE
    label = (
        "REAL"
        if label_idx == 1
        else "SPOOF"
    )

    return {
        "label": label,
        "score": score,
        "class_id": label_idx,
        "probabilities": probabilities[0],
    }


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError(
        "Cannot open webcam"
    )


print()
print("==============================")
print("LIVENESS TEST")
print("==============================")
print("REAL face")
print("Printed photo")
print("Phone/photo/video")
print()
print("Press Q to quit")
print("==============================")


while True:

    ok, frame = cap.read()

    if not ok:
        break

    faces = face_app.get(frame)

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

    else:

        for face in faces:

            bbox = face.bbox.tolist()

            result = predict_liveness(
                frame,
                bbox
            )

            if result is None:
                continue

            x1, y1, x2, y2 = map(
                int,
                bbox
            )

            label = result["label"]
            score = result["score"]
            class_id = result["class_id"]

            if label == "REAL":
                color = (0, 255, 0)
            else:
                color = (0, 0, 255)

            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                color,
                2,
            )

            text = (
                f"{label} "
                f"{score:.3f} "
                f"class={class_id}"
            )

            cv2.putText(
                frame,
                text,
                (x1, max(30, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                color,
                2,
            )

            # Show all 3 class probabilities
            probs = result["probabilities"]

            probs_text = (
                "probs="
                + np.array2string(
                    probs,
                    precision=3,
                    suppress_small=True,
                )
            )

            cv2.putText(
                frame,
                probs_text,
                (20, frame.shape[0] - 20),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 0),
                1,
            )

    cv2.imshow(
        "AntiCheating2 - Liveness",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break


cap.release()
cv2.destroyAllWindows()