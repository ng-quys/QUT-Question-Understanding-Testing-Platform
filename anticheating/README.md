# QUT Anti-Cheating Service

This directory contains the runtime AI anti-cheating service integrated with QUT.

## Runtime modules

- M1 Identity + Liveness
- M2 Person detection
- M3 Object detection
- M4 Head pose
- M5 Hand-object interaction
- M6 Audio VAD
- M7 Browser monitoring bridge
- M8 Temporal tracking
- M9 Risk engine
- M10 Evidence logging

## Run

Start the service from this directory:

    python app/run_service.py

The service listens on `127.0.0.1:8000`. Spring Boot calls `/session/start` and `/session/stop`.
The running pipeline exposes the internal M7 browser bridge on `127.0.0.1:8765`.

## Models

Runtime models belong under `models/`.
The custom M3 model is expected at `models/objects/best.pt`.
Do not commit large model binaries, student photos, or evidence to Git.

## Student face reference

The Spring Boot profile service stores each student's face photo as `student-profiles/<studentId>.jpg`.
When an attempt starts, the AI service loads the reference image for that student only.
