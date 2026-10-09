from ultralytics import YOLO
import cv2

model = YOLO(
    r"D:\AntiCheating2\models\person\yolo11s.pt"
)

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    raise RuntimeError("Cannot open webcam")

while True:
    ok, frame = cap.read()

    if not ok:
        break

    result = model.predict(
        frame,
        classes=[0],   # person
        conf=0.20,
        device=0,
        verbose=False
    )[0]

    person_count = 0

    for box in result.boxes:
        person_count += 1

        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf = float(box.conf[0])

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"person {conf:.2f}",
            (x1, max(25, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

    cv2.putText(
        frame,
        f"Persons: {person_count}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255, 255, 0),
        2
    )

    if person_count == 0:
        status = "NO PERSON"
        color = (0, 0, 255)
    elif person_count == 1:
        status = "PERSON OK"
        color = (0, 255, 0)
    else:
        status = "MULTIPLE PEOPLE"
        color = (0, 0, 255)

    cv2.putText(
        frame,
        status,
        (20, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        color,
        2
    )

    cv2.imshow("AntiCheating2 - Person Detector", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()