import json
import subprocess
from collections import defaultdict, deque

import cv2
import imageio_ffmpeg
import numpy as np
from ultralytics import YOLO

from . import db
from .homography_utils import build_homography, get_foot_point, warp_point
from .storage import output_path, raw_output_path
from .zone_tracker import ZoneTracker
from .zone_utils import draw_reference_polygon

MODEL_NAME = "yolov8n.pt"
CLASS_PERSON = 0
TRACKER = "botsort.yaml"

ZONE_WIDTH = 400
ZONE_HEIGHT = 600
TRAIL_LENGTH = 30
TRAIL_COLOR_BGR = (43, 129, 185)
PROGRESS_UPDATE_EVERY = 5

_model = None


def get_model():
    global _model
    if _model is None:
        _model = YOLO(MODEL_NAME)
    return _model


def run_pipeline(job_id: str):
    job = db.get_job(job_id)
    video = db.get_video(job["video_id"])

    cap = None
    writer = None
    try:
        db.update_job(job_id, status="processing")

        src_points = np.float32(json.loads(job["points"]))
        dst_points = np.float32([
            [0, 0],
            [ZONE_WIDTH, 0],
            [ZONE_WIDTH, ZONE_HEIGHT],
            [0, ZONE_HEIGHT],
        ])
        kill_zone = dst_points.astype(np.int32)
        H = build_homography(src_points, dst_points)

        cap = cv2.VideoCapture(video["path"])
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

        out_path = output_path(job_id)
        raw_path = raw_output_path(job_id)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(raw_path), fourcc, fps, (width, height))

        tracker_state = ZoneTracker(kill_zone, fps)
        trails = defaultdict(lambda: deque(maxlen=TRAIL_LENGTH))
        model = get_model()
        events = []

        frame_count = 0
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
            frame_count += 1

            results = model.track(
                frame,
                classes=[CLASS_PERSON],
                tracker=TRACKER,
                persist=True,
                verbose=False,
            )

            if results[0].boxes.id is not None:
                track_ids = results[0].boxes.id.int().tolist()
                boxes_xyxy = results[0].boxes.xyxy.tolist()

                for track_id, box in zip(track_ids, boxes_xyxy):
                    foot = get_foot_point(box)
                    trails[track_id].append(foot)
                    warped_point = warp_point(foot[0], foot[1], H)
                    event = tracker_state.update(track_id, warped_point, frame_count)
                    if event is not None:
                        events.append({
                            "frame": frame_count,
                            "seconds": round(frame_count / fps, 1),
                            "track_id": track_id,
                            "type": event,
                        })

            annotated = results[0].plot()
            draw_reference_polygon(annotated, src_points)

            if trails:
                overlay = annotated.copy()
                for points in trails.values():
                    for i in range(1, len(points)):
                        a = tuple(int(v) for v in points[i - 1])
                        b = tuple(int(v) for v in points[i])
                        cv2.line(overlay, a, b, TRAIL_COLOR_BGR, 2, cv2.LINE_AA)
                annotated = cv2.addWeighted(overlay, 0.45, annotated, 0.55, 0)

            writer.write(annotated)

            if frame_count % PROGRESS_UPDATE_EVERY == 0:
                db.update_job(
                    job_id,
                    progress_current=frame_count,
                    progress_total=total_frames,
                )

        tracker_state.finalize(frame_count)

        cap.release()
        writer.release()
        cap = None
        writer = None

        # OpenCV's mp4v/FMP4 output isn't decodable by browsers — re-encode to H.264
        # (via the ffmpeg binary imageio-ffmpeg bundles) before serving it.
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run(
            [
                ffmpeg_exe, "-y",
                "-i", str(raw_path),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(out_path),
            ],
            check=True,
            capture_output=True,
        )
        raw_path.unlink(missing_ok=True)

        db.update_job(
            job_id,
            status="done",
            progress_current=frame_count,
            progress_total=total_frames or frame_count,
            events=json.dumps(events),
            unique_ids=len(tracker_state.unique_ids),
            dwell_records=json.dumps(tracker_state.dwell_records),
            output_path=str(out_path),
        )
    except subprocess.CalledProcessError as exc:
        db.update_job(job_id, status="failed", error=f"Transcoding failed: {exc.stderr.decode(errors='replace')[-500:]}")
    except Exception as exc:  # noqa: BLE001 - surface any failure to the job record
        db.update_job(job_id, status="failed", error=str(exc))
    finally:
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()
