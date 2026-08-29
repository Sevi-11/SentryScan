import base64
import os
import re
import uuid
from pathlib import Path

import cv2
from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import db
from .pipeline import run_pipeline
from .storage import (
    ALLOWED_EXTENSIONS,
    MAX_DURATION_SECONDS,
    MAX_UPLOAD_BYTES,
    upload_path,
)

app = FastAPI(title="SentryScan API")

# ALLOWED_ORIGIN is the deployed frontend's URL (e.g. https://sentryscan.vercel.app);
# localhost is always allowed for local dev.
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN")
_origin_pattern = r"http://localhost:\d+"
if ALLOWED_ORIGIN:
    _origin_pattern += f"|{re.escape(ALLOWED_ORIGIN)}"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_origin_pattern,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db.init_db()


class CreateJobRequest(BaseModel):
    video_id: str
    points: list[list[float]] = Field(min_length=3, max_length=8)


@app.post("/api/videos")
async def upload_video(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Use one of {sorted(ALLOWED_EXTENSIONS)}.")

    video_id = uuid.uuid4().hex
    dest = upload_path(video_id, ext)

    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"Video is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
            out.write(chunk)

    cap = cv2.VideoCapture(str(dest))
    if not cap.isOpened():
        cap.release()
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Couldn't read that file as a video.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration_seconds = frame_count / fps if fps else 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if duration_seconds > MAX_DURATION_SECONDS:
        cap.release()
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Video is longer than the {MAX_DURATION_SECONDS // 60} minute limit.")

    ok, frame = cap.read()
    cap.release()
    if not ok:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Couldn't read a frame from that video.")

    ok, buf = cv2.imencode(".png", frame)
    if not ok:
        raise HTTPException(500, "Couldn't encode the preview frame.")
    frame_data_url = "data:image/png;base64," + base64.b64encode(buf).decode("ascii")

    db.create_video(video_id, dest, width, height, duration_seconds)

    return {
        "video_id": video_id,
        "width": width,
        "height": height,
        "duration_seconds": duration_seconds,
        "frame": frame_data_url,
    }


@app.post("/api/jobs")
def create_job(body: CreateJobRequest, background_tasks: BackgroundTasks):
    video = db.get_video(body.video_id)
    if video is None:
        raise HTTPException(404, "Unknown video_id — upload a video first.")

    job_id = uuid.uuid4().hex
    db.create_job(job_id, body.video_id, body.points)
    background_tasks.add_task(run_pipeline, job_id)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = db.get_job(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job_id.")

    import json

    response = {
        "job_id": job["id"],
        "status": job["status"],
        "progress": {
            "current": job["progress_current"] or 0,
            "total": job["progress_total"] or 0,
        },
        "events": json.loads(job["events"] or "[]"),
    }
    if job["status"] == "done":
        response["summary"] = {
            "unique_ids": job["unique_ids"],
            "dwell_records": json.loads(job["dwell_records"] or "[]"),
        }
        response["video_url"] = f"/api/jobs/{job_id}/video"
    if job["status"] == "failed":
        response["error"] = job["error"]
    return response


@app.get("/api/jobs/{job_id}/video")
def get_job_video(job_id: str):
    job = db.get_job(job_id)
    if job is None or job["status"] != "done" or not job["output_path"]:
        raise HTTPException(404, "That job's video isn't ready yet.")
    return FileResponse(job["output_path"], media_type="video/mp4")
