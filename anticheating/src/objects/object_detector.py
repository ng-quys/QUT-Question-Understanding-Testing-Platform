from ultralytics import YOLO
import cv2

# MODEL = r"D:\AntiCheating2\runs\objects\module3_yolo11s_v1\weights\best.pt"
MODEL = r"D:\AntiCheating2\runs\objects\module3_yolo11s_v2_phonefix\weights\best.pt"
model = YOLO(MODEL)

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")

while True:
    ok, frame = cap.read()

    if not ok:
        break

    result = model.predict(
        frame,
        imgsz=640,
        conf=0.20,
        device=0,
        verbose=False
    )[0]

    detected = []

    for box in result.boxes:

        cls_id = int(box.cls[0])
        conf = float(box.conf[0])

        label = model.names[cls_id]

        x1, y1, x2, y2 = map(
            int,
            box.xyxy[0].tolist()
        )

        detected.append(label)

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"{label} {conf:.2f}",
            (x1, max(25, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 255, 0),
            2
        )

    status = (
        ", ".join(sorted(set(detected)))
        if detected
        else "none"
    )

    cv2.putText(
        frame,
        f"Detected: {status}",
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 0),
        2
    )

    cv2.imshow(
        "AntiCheating2 - Object Detector",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
