# Object detection without a hand model

The web worker (`app/shared_inference.py`) and direct-camera worker
(`app/anticheating_pipeline.py`) no longer import MediaPipe or load hand weights.
The standard requirements and required-model check no longer require them.
Existing model files are preserved; uninstalling installed packages is unnecessary.

Online monitoring emits `PHONE_VISIBLE`, `TABLET_VISIBLE`, or `MATERIAL_VISIBLE`.
Objects must have confidence >= 0.45, a valid box, and repeated observations for
1.2 seconds before the existing 1-second temporal confirmation. An object need
not overlap a person. This reports visibility, never proof of holding or cheating.
Disappearance, a new sampling lease, or a coverage gap resets confirmation.
Existing online review weights (40/35/35) are retained under the new codes.

Offline single-image analysis retains its existing visibility events and scoring;
it does not claim duration, audio, or holding. Historical `HOLDING_*` records are
not rewritten; the shared evidence UI labels them as detected objects.

Archived standalone experiments in `src/interaction/` are not runtime entry points
and are not installed or invoked by the standard service. Their historical hand
experiment is not supported by the current standard requirements.

Restart the AI service when no exam is active to load this code. Do not restart an
active exam. This change does not modify face verification, people counting,
head direction, audio, offline answer storage, or grades.
