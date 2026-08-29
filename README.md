# SentryScan — Detect. Track. Protect.

Human detection and tracking, formerly known as HuDeTra.

Tracks people in a video, detects when they enter/exit a zone you define, and keeps a record of where each person went and how long they stayed. Ships two ways:

- **`main.py`** — the original standalone script: run it against a local video file and preview file, no server involved.
- **`backend/` + `frontend/`** — a web app: upload a clip, draw a zone by clicking points on the first frame, and get back an annotated video with a record that stays in sync as you scrub through playback (ask "how many were in the zone at 0:20?" and the log answers it at that exact timestamp).

## How it works

1. **Detection & tracking** — [YOLO](https://github.com/ultralytics/ultralytics) (`yolov8n.pt`) runs on each video frame, filtered to the "person" class, with BoT-SORT (`botsort.yaml`) assigning a persistent ID to each detected person across frames.
2. **Ground-plane mapping** — a homography matrix maps four calibration points (raw camera pixels) to a clean rectangle (bird's-eye view). Each person's foot point (bottom-center of their bounding box) is warped into this space, since ground position is more meaningful than raw pixel position for zone detection on an angled camera.
3. **Zone entry/exit logging** — `ZoneTracker` checks, per person per frame, whether their warped foot point falls inside the zone polygon (`cv2.pointPolygonTest`). It logs entry/exit events and computes dwell time (seconds spent in the zone) for every completed visit.
4. **Trajectories** — each person's raw foot-point history is kept and drawn as a fading trail on the output video, alongside their bounding box and ID.
5. **Output** — annotated video frames (bounding boxes, trails, zone outline) are written to an output video, and a summary (unique people seen, per-person dwell times) is returned alongside it.

## Web app

```
backend/    FastAPI service — upload, frame extraction, job processing, SQLite job store
frontend/   Next.js app — landing page + upload/zone-drawing/results UI
```

### Running the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

`yolov8n.pt` is expected at `backend/yolov8n.pt` (already copied over); Ultralytics will auto-download it if missing. Uploaded videos, job outputs, and the job database live under `backend/storage/` (gitignored).

> Port 8000 is blocked by a Windows permission restriction on this machine — the backend runs on **8010** here. Pick whatever's free on yours and update the frontend's `.env.local` to match.

### Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (copy `.env.local.example`) to wherever the backend is running — e.g. `http://localhost:8010`.

### API

- `POST /api/videos` — multipart video upload. Validates type/size/duration, extracts frame 1, returns `{ video_id, width, height, frame }` (frame as a data URL).
- `POST /api/jobs` — `{ video_id, points: [[x,y], ...] }` (3–8 points, in the frame's own pixel coordinates). Starts the pipeline in the background, returns `{ job_id }`.
- `GET /api/jobs/{job_id}` — `{ status, progress: { current, total }, events, summary?, video_url?, error? }`. While processing, the frontend only shows overall progress — not per-frame detail, so the UI doesn't reveal how slow a given frame took. `events` is the full list of `{ frame, seconds, track_id, type }` entry/exit events; once the job is done, the frontend replays this against the output video's own `currentTime` as it plays, so the log and the "currently in zone" count always match what's on screen at that moment.
- `GET /api/jobs/{job_id}/video` — the annotated output video (H.264, browser-playable — OpenCV's own output codec isn't), once `status` is `"done"`.

### Limits worth knowing

- Max upload size: 200 MB. Max duration: 5 minutes. (`backend/app/storage.py`)
- Jobs run one at a time per request via FastAPI `BackgroundTasks` — fine for a demo, not for concurrent load.
- No cleanup/TTL on `backend/storage/` yet — uploaded and output videos accumulate until manually cleared.

## Deployment

- **`frontend/`** deploys to Vercel as-is (no code changes needed — see [frontend/DEPLOY.md](frontend/DEPLOY.md)): import the repo, set root directory to `frontend`, set `NEXT_PUBLIC_API_URL`.
- **`backend/`** is set up to deploy to Google Cloud Run ([backend/DEPLOY.md](backend/DEPLOY.md)) or Hugging Face Spaces' Docker SDK ([backend/README.md](backend/README.md) has the Space metadata) — **currently on hold**: it needs real Python + ffmpeg + opencv + ultralytics(torch), which ruled out every card-free host we checked (Render/Koyeb: 512MB RAM, too tight; Hugging Face Spaces: Docker/Gradio now require a paid plan; Fly.io: no free tier for new accounts). Google Cloud Run fits (generous free quota, real headroom) but billing-account creation has failed twice for this account — unresolved. Worth trying Azure Container Apps (same free-tier shape as Cloud Run, different signup pipeline) or falling back to a time-limited option (Railway's $5/30-day trial, 1GB RAM, no card) if that keeps failing.
- **`space/`** is a self-contained alternative: the same zone-tracking pipeline wrapped in a single Gradio app instead of the FastAPI+Next.js pair — no CORS/hosting coordination between two services, at the cost of a plainer UI. See [space/DEPLOY.md](space/DEPLOY.md). Not currently deployed anywhere either, for the same Docker-hosting reason as `backend/`.

## Running the standalone script

```bash
python main.py
```

Press `q` in the preview window to stop early. Configuration (paths, model, zone points) lives in [config.py](config.py). Model weights (`*.pt`) and video files are not tracked in this repo — place `yolov8n.pt` and your source video under `data/` and point `config.py` at them.
