# SentryScan — Detect. Track. Protect.

Human detection and tracking.

Tracks people in a video, detects when they enter/exit a zone you define, and keeps a record of where each person went and how long they stayed. Positioned toward physical security / perimeter monitoring (restricted zones, facilities, construction sites) — anonymous, per-video tracking, not identity recognition. Ships three ways:

- **`main.py`** — the original standalone script: run it against a local video file and preview file, no server involved.
- **`backend/` + `frontend/`** — a web app: upload a clip, draw a zone by clicking points on the first frame, and get back an annotated video with a record that stays in sync as you scrub through playback (ask "how many were in the zone at 0:20?" and the log answers it at that exact timestamp).
- **`space/`** — a self-contained alternative: the same pipeline wrapped in a single Gradio app instead of the FastAPI+Next.js pair, for simpler one-piece deployment.

This project is being planned and built in stages — see [Roadmap](#roadmap) for where it's headed and [Design Decisions](#design-decisions) for why.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Backend | Python, FastAPI |
| Database | SQLite *(local only, current)* → **PostgreSQL** (Stage 1) |
| Detection & tracking | YOLOv8n + BoT-SORT ([ultralytics](https://github.com/ultralytics/ultralytics)) |
| Video I/O | OpenCV, ffmpeg (`imageio-ffmpeg`) |
| Video storage | Local disk / Docker volume |
| Auth | None *(current)* → **single admin login** (Stage 1) |
| Testing | None *(current)* → **pytest** (Stage 1) |
| CI/CD | None *(current)* → **GitHub Actions** (Stage 1) |
| Observability | None *(current)* → **structured logging + Sentry** (Stage 1) |
| Deployment | Local only *(current)* → **Docker Compose (dev) + hosted (Stage 1, host TBD)** |
| Alternate demo | Gradio (`space/`) — self-contained, single-app version of the same pipeline |

## Architecture

```
┌─────────────┐      ┌──────────────────┐       ┌─────────────────────┐
│   Next.js   │─────▶│     FastAPI      │──────▶│  YOLO + BoT-SORT +  │
│ (upload +   │◀─────│  (upload, jobs,  │◀──────│  homography zone    │
│ zone-draw)  │      │   video routes)  │       │  tracking pipeline  │
└─────────────┘      └──────────────────┘       └──────────┬──────────┘
                             │                              │
                             ▼                              ▼
                      ┌─────────────┐              ┌────────────────┐
                      │   SQLite    │              │  Local disk    │
                      │ (videos,    │              │ (uploads,      │
                      │  jobs)      │              │  outputs)      │
                      └─────────────┘              └────────────────┘
```

Stage 1 replaces the SQLite box with PostgreSQL and adds an auth layer in front of FastAPI — see [Roadmap](#roadmap).

## How it works

1. **Detection & tracking** — YOLO (`yolov8n.pt`) runs on each video frame, filtered to the "person" class, with BoT-SORT (`botsort.yaml`) assigning a persistent ID to each detected person across frames.
2. **Ground-plane mapping** — a homography matrix maps four calibration points (raw camera pixels) to a clean rectangle (bird's-eye view). Each person's foot point (bottom-center of their bounding box) is warped into this space, since ground position is more meaningful than raw pixel position for zone detection on an angled camera.
3. **Zone entry/exit logging** — `ZoneTracker` checks, per person per frame, whether their warped foot point falls inside the zone polygon (`cv2.pointPolygonTest`). It logs entry/exit events and computes dwell time (seconds spent in the zone) for every completed visit.
4. **Trajectories** — each person's raw foot-point history is kept and drawn as a fading trail on the output video, alongside their bounding box and ID.
5. **Output** — annotated video frames (bounding boxes, trails, zone outline) are written to an output video, and a summary (unique people seen, per-person dwell times) is returned alongside it.

Tracking is anonymous and per-video-ephemeral by design — a `track_id` has no meaning outside the video it came from, and there is no facial recognition or biometric identification anywhere in this pipeline. See [Design Decisions](#design-decisions).

## Project Structure

```
backend/
├── app/
│   ├── main.py               # FastAPI app + routes (upload, jobs)
│   ├── pipeline.py            # detection/tracking/zone job entrypoint
│   ├── db.py                   # SQLite access today — PostgreSQL in Stage 1
│   ├── storage.py               # local file paths for uploads/outputs
│   ├── homography_utils.py       # pure: pixel → bird's-eye-view mapping
│   ├── zone_tracker.py            # pure: per-person entry/exit/dwell state
│   └── zone_utils.py               # pure: point-in-polygon test, drawing
├── Dockerfile
├── DEPLOY.md
└── requirements.txt

frontend/
├── app/                       # Next.js App Router pages + components
├── DEPLOY.md
└── package.json

space/                         # self-contained Gradio alternative (same pipeline, single app)
├── app.py
├── pipeline.py
└── DEPLOY.md

main.py, config.py,            # original standalone script — no server involved
homography_utils.py,
zone_tracker.py, zone_utils.py

data/                          # local video/model inputs for the standalone script (gitignored)
```

The pure logic (`homography_utils.py`, `zone_tracker.py`, `zone_utils.py`) has no framework dependency and is duplicated identically between `backend/app/`, `space/`, and the root standalone script — each entry point is independently runnable, and the actual algorithm can be tested in isolation from any of them.

## Web app

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
- Jobs run one at a time per request via FastAPI `BackgroundTasks` — fine for a demo, not for concurrent load. Stage 2 replaces this with a real async job queue once multi-tenancy makes concurrent jobs a real scenario.
- No cleanup/TTL on `backend/storage/` yet — uploaded and output videos accumulate until manually cleared.
- No authentication yet — anyone who can reach the API can use it. Closed in Stage 1.

## Design Decisions

A few choices worth calling out (fuller reasoning to live in `docs/adr/` as the project matures):

- **FastAPI + Next.js kept as-is going into Stage 1, not rewritten** — both already work end-to-end. Rewriting the framework to match a different project's stack would cost real time for zero Stage 1 benefit.
- **PostgreSQL over staying on SQLite** — SQLite's single-writer-file model doesn't survive redeploys/container restarts cleanly and can't be shared across processes. Postgres is well-understood, low-risk work, not a new technology to learn.
- **No object/cloud storage yet** — video files stay on local disk / a Docker volume through Stage 1. Premature to add S3-style storage before it's actually needed; revisit only if Stage 2's multi-tenancy demands it.
- **Single admin login, not a full user system, in Stage 1** — Stage 1 is still single-tenant. A full account system built now would get rebuilt again for Stage 2's real multi-tenancy anyway — this is the smallest primitive that actually closes the "public URL, no login" gap.
- **No facial recognition or biometric identification, ever** — tracking is anonymous and per-video-ephemeral. This is a deliberate product and compliance boundary, not a missing feature — it's what makes "physical security monitoring" a defensible product to build at all.
- **Backend compute host still undecided** — Google Cloud Run was the pick (real headroom, generous free quota) but billing-account verification has failed twice for this Google account. Azure Container Apps and Railway's trial are the live alternatives. Tracked as an open Stage 1 item, not a blocker on the rest of the plan.

## Roadmap

Full reasoning behind each stage (architecture, data model, non-goals, invariants) lives in [docs/superpowers/specs/2026-08-30-sentryscan-roadmap-design.md](docs/superpowers/specs/2026-08-30-sentryscan-roadmap-design.md) — this checklist is the short version.

**Stage 0 — Prototype** *(done)*
- [x] Standalone detection/tracking/zone script (`main.py`)
- [x] FastAPI backend + Next.js frontend (batch upload → zone-draw → process → review)
- [x] Self-contained Gradio alternative (`space/`)

**Stage 1 — Hardened single-tenant product** *(in progress)*
- [ ] PostgreSQL replacing SQLite
- [ ] Single admin auth
- [ ] Dockerfile upgraded (multi-stage build, non-root user, `HEALTHCHECK`)
- [ ] `docker-compose.yml` + `.override.yml` + `.prod.yml` split for local/dev/prod
- [ ] pytest suite (`zone_tracker`, `homography_utils` unit tests + API integration tests)
- [ ] GitHub Actions CI/CD (lint → test → build → deploy)
- [ ] Structured logging + Sentry error tracking
- [ ] Rate limiting on upload/job endpoints
- [ ] Resolve backend compute host (Cloud Run blocked; Azure/Railway candidates)
- [ ] Deployed at a real URL, survives a restart without losing data

**Stage 2 — Multi-tenant SaaS** *(planned)*
- [ ] Organizations/accounts, per-tenant data isolation
- [ ] Multi-user auth with roles (admin/viewer), invite flow
- [ ] Stripe billing, plan tiers and usage quotas
- [ ] Async job queue (replaces single-instance `BackgroundTasks`)

**Stage 3 — Live monitoring** *(planned, deliberately deferred — resource-intensive)*
- [ ] RTSP/live camera ingestion
- [ ] Real-time inference + alerting (webhook/email/SMS/Slack)
- [ ] Live occupancy dashboard (WebSocket)
- [ ] Incident timeline / audit log per camera

## Deployment

- **`frontend/`** deploys to Vercel as-is (no code changes needed — see [frontend/DEPLOY.md](frontend/DEPLOY.md)): import the repo, set root directory to `frontend`, set `NEXT_PUBLIC_API_URL`.
- **`backend/`** is set up to deploy to Google Cloud Run ([backend/DEPLOY.md](backend/DEPLOY.md)) or Hugging Face Spaces' Docker SDK ([backend/README.md](backend/README.md) has the Space metadata) — see [Design Decisions](#design-decisions) for why this is still unresolved.
- **`space/`** — see [space/DEPLOY.md](space/DEPLOY.md). Not currently deployed anywhere either, for the same compute-hosting reason as `backend/`.

## Running the standalone script

```bash
python main.py
```

Press `q` in the preview window to stop early. Configuration (paths, model, zone points) lives in [config.py](config.py). Model weights (`*.pt`) and video files are not tracked in this repo — place `yolov8n.pt` and your source video under `data/` and point `config.py` at them.
