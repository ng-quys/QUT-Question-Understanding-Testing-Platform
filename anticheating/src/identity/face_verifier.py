from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis


# ============================================================
# CONFIG
# ============================================================

REFERENCE_IMAGE = Path(
    r"D:\AntiCheating2\Datasets\identity\reference.jpg"
)

SIMILARITY_THRESHOLD = 0.40

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
# LOAD REFERENCE FACE
# ============================================================

if not REFERENCE_IMAGE.exists():
    raise FileNotFoundError(
        f"\nReference image not found:\n{REFERENCE_IMAGE}\n"
    )

reference_img = cv2.imread(str(REFERENCE_IMAGE))

if reference_img is None:
    raise RuntimeError("Cannot read reference image")

reference_faces = app.get(reference_img)

if len(reference_faces) == 0:
    raise RuntimeError(
        "No face detected in reference image"
    )

if len(reference_faces) > 1:
    raise RuntimeError(
        "Reference image must contain exactly one face"
    )

reference_embedding = (
    reference_faces[0].normed_embedding
)

print("Reference face loaded.")


# ============================================================
# COSINE SIMILARITY
# ============================================================

def cosine_similarity(a, b):
    return float(
        np.dot(a, b)
        / (np.linalg.norm(a) * np.linalg.norm(b))
    )


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")

print()
print("====================================")
print("FACE VERIFICATION RUNNING")
print("Q = quit")
print("====================================")

while True:

    ok, frame = cap.read()

    if not ok:
        break

    faces = app.get(frame)

    # --------------------------------
    # No face
    # --------------------------------

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

    # --------------------------------
    # Multiple faces
    # --------------------------------

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

    # --------------------------------
    # One face
    # --------------------------------

    else:

        face = faces[0]

        similarity = cosine_similarity(
            reference_embedding,
            face.normed_embedding,
        )

        x1, y1, x2, y2 = map(
            int,
            face.bbox
        )

        if similarity >= SIMILARITY_THRESHOLD:

            status = "MATCH"
            color = (0, 255, 0)

        else:

            status = "NOT MATCH"
            color = (0, 0, 255)

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            color,
            2,
        )

        cv2.putText(
            frame,
            f"{status}  similarity={similarity:.3f}",
            (x1, max(30, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
        )

    cv2.imshow(
        "AntiCheating2 - Face Verification",
        frame
    )

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break


cap.release()
cv2.destroyAllWindows()