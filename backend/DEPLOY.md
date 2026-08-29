# Deploying the backend to Google Cloud Run

## Before you start

This needs a Google Cloud project with billing enabled (a card on file — see the conversation this came
from for what that does and doesn't mean cost-wise). Two things worth doing on the Cloud Console before or
right after deploying, since you're managing this yourself:

- **Billing → Budgets & alerts**: set a budget (e.g. $5) so you get emailed if spend crosses it. It doesn't
  stop billing by itself, but you'll know fast instead of finding out a month later.
- Keep the deploy pinned to **one instance** (below) — this app already only processes one job at a time
  (FastAPI `BackgroundTasks`, not concurrency-safe per the root README), so extra instances wouldn't help
  and would only risk extra cost.

## One-time setup

```bash
gcloud auth login
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

(No local Docker install needed — `--source` below has Cloud Build build the image remotely from this
Dockerfile.)

## Deploy

From the `backend/` folder:

```bash
gcloud run deploy sentryscan-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 900 \
  --set-env-vars ALLOWED_ORIGIN=https://your-frontend.vercel.app
```

Two flags matter more than they look:

- **`--no-cpu-throttling`** — required. This app starts a job and returns immediately, then keeps processing
  it in the background (`BackgroundTasks`) while the frontend polls for status. Cloud Run's default behavior
  throttles CPU to near-zero the moment a response is sent, which would stall that background processing
  until the *next* incoming request happens to wake it back up. This flag keeps CPU allocated for the whole
  time the instance is warm, not just mid-request — the trade-off is you're billed for that idle-but-warm
  time too, not just active-request time, so this deploy eats into the free tier faster than a typical
  request-only Cloud Run service would. Still fine for occasional personal use; worth knowing.
- **`--region us-central1`** — one of the regions Cloud Run's Always Free tier applies to. Deploying to a
  different region opts out of the free quota entirely.

`us-central1` here must match wherever you'd rather run it, as long as it's a free-tier-eligible region —
check the current list in Cloud Run's pricing docs before changing it.

## Storage note

Same caveat as any of the ephemeral-container options we looked at: this Cloud Run service still uses local
SQLite + local disk for job/video storage (unchanged from the code). With `min-instances 0`, if the container
scales all the way down to zero between phases of a job, that state is lost — in practice this only bites if
the service sits fully idle for a while mid-session, not during a normal upload → draw zone → wait → watch
result flow. If you want this to survive scale-to-zero reliably, that needs moving job metadata to Cloud SQL
and videos to Cloud Storage — real work, not needed for a personal demo.

## Verify

```bash
curl https://<the-url-gcloud-printed>/docs
```

Should return FastAPI's interactive docs page. Then set that URL as `NEXT_PUBLIC_API_URL` in Vercel (see
[../frontend/DEPLOY.md](../frontend/DEPLOY.md)), and update `ALLOWED_ORIGIN` above once you know the actual
Vercel URL (redeploy with `gcloud run deploy` again — same command, it updates the existing service).
