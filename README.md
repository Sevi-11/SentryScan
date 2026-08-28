# Human Tracker

Tracks people in a video, detects when they enter/exit a defined "kill zone," and logs how long each person spent inside it.

## How it works

1. **Detection & tracking** — [main.py](main.py) runs [YOLO](https://github.com/ultralytics/ultralytics) (`yolov8n.pt`) on each video frame, filtered to the "person" class, with BoT-SORT (`botsort.yaml`) assigning a persistent ID to each detected person across frames.
2. **Ground-plane mapping** — [homography_utils.py](homography_utils.py) computes a homography matrix from four calibration points (raw camera pixels) to a clean rectangle (bird's-eye view). Each person's foot point (bottom-center of their bounding box) is warped into this bird's-eye space, since ground position is more meaningful than raw pixel position for zone detection on an angled camera.
3. **Zone entry/exit logging** — [zone_tracker.py](zone_tracker.py) (`ZoneTracker`) checks, per person per frame, whether their warped foot point falls inside the zone polygon ([zone_utils.py](zone_utils.py) via `cv2.pointPolygonTest`). It logs entry/exit events and computes dwell time (seconds spent in the zone) for every completed visit, plus a final summary of unique people seen and total zone visits.
4. **Output** — annotated video frames (bounding boxes, zone outline, live counters) are written to an output video file and shown in a live preview window while processing runs.

## Configuration

All paths, model settings, and zone/calibration points are defined in [config.py](config.py):

- `VIDEO_PATH` / `OUTPUT_PATH` — input video and annotated output path
- `MODEL_NAME` — YOLO weights file (`yolov8n.pt`)
- `TRACKER` — tracker config (`botsort.yaml`)
- `SRC_POINTS` / `DST_POINTS` — four-point calibration mapping raw camera pixels to bird's-eye coordinates
- `KILL_ZONE` — the zone polygon (in warped/bird's-eye space) that triggers entry/exit tracking

## Running it

```bash
python main.py
```

Press `q` in the preview window to stop early. A summary of unique IDs seen and per-person dwell times prints to the console when the video ends.

## Requirements

- Python 3
- `opencv-python`
- `ultralytics`
- `numpy`

Model weights (`*.pt`) and video files are not tracked in this repo — place `yolov8n.pt` and your source video under `data/` and point `config.py` at them.
