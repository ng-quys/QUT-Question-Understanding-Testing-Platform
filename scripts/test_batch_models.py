"""Load actual models and process synthetic JPEG/PCM only; no camera/cloud/DB.

Run with anticheating/.venv/Scripts/python.exe scripts/test_batch_models.py.
This checks model compatibility, not identity accuracy or simultaneous capacity.
"""
import sys
import tempfile
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / "anticheating/app"))
sys.path.insert(0,str(ROOT / "anticheating"))
from batch_monitor import Session
from shared_inference import SharedInference


def main():
    started=time.monotonic()
    model=SharedInference()
    try:
        import cv2
        import numpy as np
        from src.evidence.evidence_logger import EvidenceLogger
        image=np.full((480,640,3),127,dtype=np.uint8)
        ok,jpeg=cv2.imencode(".jpg",image)
        assert ok
        with tempfile.TemporaryDirectory(prefix="qut-synthetic-") as directory:
            # Artificial embedding avoids supplying or uploading a personal face.
            a=Session(1,101,1,time.time()+60,b"",time.time())
            b=Session(2,102,1,time.time()+60,b"",time.time())
            for item in (a,b):
                item.context.update(embedding=np.zeros(512,dtype=np.float32),logger=EvidenceLogger(Path(directory)/str(item.attempt),item.attempt))
                result=model.analyze(item,jpeg.tobytes(),bytes(9600),time.time(),1)
                assert not result  # no alert based on a single synthetic frame
                assert item.context["tracker"].get("NO_FACE").active
            assert a.context["tracker"] is not b.context["tracker"]
            assert not list(Path(directory).rglob("*.jpg"))
        print(f"PASS: shared models, two isolated synthetic JPEG/PCM samples, no evidence upload; {time.monotonic()-started:.1f}s")
    finally:
        model.close()


if __name__=="__main__":main()
