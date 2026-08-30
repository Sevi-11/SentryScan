# SentryScan Product Roadmap Design

## Decision

Grow SentryScan through four independently-shippable stages rather than one big-bang rebuild. Stage 0 (the current prototype) is done. Stage 1 hardens it into a real, deployed, single-tenant product with production engineering practices. Stage 2 turns it into multi-tenant SaaS — documented now, not committed to being built next. Stage 3 adds live camera ingestion and real-time alerting, the actual perimeter-security value proposition, deliberately deferred until it's resource-justified.

Positioning: physical security / perimeter monitoring (restricted zones, facilities, construction sites), built as a portfolio piece demonstrating production-grade planning and engineering practice rather than a funded product with real customers.

## Rationale

A staged model mirrors how real CV/security products actually grow, keeps every stage independently demoable, and avoids the two failure modes of the alternatives considered: rebuilding the foundation before shipping anything new (upfront SaaS-native rebuild), and over-engineering toward a target architecture that stalls before anything ships (big-bang enterprise design). Each stage's exit criteria is concrete enough to know when it's actually done.

Batch/upload processing stays the interaction model through Stage 1 rather than jumping to live streaming, because live inference is the real cost driver here (continuous compute vs. per-job compute) and the resources to run it well aren't in place yet. Batch is also what already works today, so Stage 1 can focus entirely on production-hardening instead of also taking on a new architecture surface.

Multi-tenancy (Stage 2) is documented so the roadmap tells a complete story, but Stage 1's schema choices (`owner_user_id` on `videos`/`jobs` from the start) are cheap insurance that make Stage 2 a migration instead of a redesign, whether or not Stage 2 is ever built.

## Non-goals

- No live camera streaming or real-time alerting in Stage 1 — that's Stage 3, deferred.
- No multi-tenancy, billing, or multi-user accounts in Stage 1 — Stage 1 is single-admin.
- No facial recognition or biometric identification, ever, at any stage — tracking stays anonymous and per-video-ephemeral. This is a permanent product/compliance boundary, not a phased-in feature.
- No cloud object storage (S3/R2/etc.) until a stage's actual scale demands it — local disk / Docker volume is suffient through at least Stage 1.
- No Kubernetes, service mesh, or microservice split at any stage this roadmap covers — a monolithic FastAPI service plus a Next.js frontend is the right shape for the traffic this will ever realistically see as a portfolio project.
- No commitment to build Stage 2 or Stage 3 on any particular timeline — they are planned, not scheduled.

## Stage 1 — Hardened single-tenant product

**Exit criteria:** a real person can sign in, upload a video, get results, on a real URL, and the system survives a restart without losing data. Has CI/CD and automated tests.

**Architecture & stack** — Keep FastAPI + Next.js (both already work; rewriting the framework to mirror a different project's stack buys nothing here). Replace local SQLite + local disk's SQLite half with self-hosted PostgreSQL: Docker Compose for local dev, a managed Postgres instance in production. Video files stay on local disk / a Docker volume — no object storage yet.

**Data model** — `videos` and `jobs` tables move from SQLite to Postgres, largely unchanged, plus one new column each: `owner_user_id`. Only one real user exists at this stage, but the column means Stage 2's tenancy is additive, not a schema rewrite.

**Auth** — Single admin login (email/password or a small JWT/session implementation), not a full user system. Stage 1 is single-tenant; building full accounts now would mean rebuilding them for Stage 2 anyway.

**Deployment & CI/CD** — Frontend keeps auto-deploying via Vercel's git integration. Backend gets a GitHub Actions pipeline (lint → test → build → deploy) targeting whichever compute host is resolved (open item — see Invariants). `docker-compose.yml` (base) + `.override.yml` (dev bind-mount) + `.prod.yml` (restart policies, secrets via `${VAR}`) for local/dev/prod, matching the pattern already proven in the Aixia project. Dockerfile upgraded to multi-stage build, non-root user, `HEALTHCHECK` directive.

**Observability & security** — Sentry for error tracking on both sides; structured JSON logging instead of prints; rate limiting on the upload/job endpoints (currently wide open); secrets via the host's env/secret manager, never hardcoded.

**Testing** — pytest unit tests for the pure logic (`zone_tracker.py`, `homography_utils.py` — no mocking needed, framework-free), an integration test hitting the API against a test Postgres DB, one Playwright smoke test covering upload → draw zone → process → review end to end.

**Job processing** — Stays as FastAPI `BackgroundTasks`, one job at a time. A real task queue is a Stage 2 problem, once concurrent tenants make it one.

## Stage 2 — Multi-tenant SaaS (documented, not committed)

**Exit criteria:** two independent test "customers" can use the product without seeing each other's data, and get billed correctly in Stripe sandbox mode.

**Data model & isolation** — Add an `organizations` table; `videos`/`jobs` gain `org_id` alongside Stage 1's `owner_user_id`. Row-level scoping enforced at the query layer — every service function filters by the requesting org's ID, never trusts a client-supplied filter.

**Auth** — Extend Stage 1's single-admin login to real multi-user org accounts: roles (`admin`/`viewer`), invite-by-email, per-org session scoping. Still no RBAC framework — a role is a column, checked in the service layer.

**Billing** — Stripe checkout + customer portal, plan tiers gated on video-minutes processed per month (the actual compute cost driver). Usage enforced before a job starts, not after.

**Job processing** — Moves off single-instance `BackgroundTasks` to a real queue (Celery+Redis or the eventual host's native task queue), since concurrent orgs submitting jobs simultaneously is what actually breaks the Stage 1 model.

**Admin/ops** — A minimal internal-only view of per-org usage/health.

## Stage 3 — Live monitoring (deferred, resource-intensive)

**Exit criteria:** a live RTSP stream triggers a real-time alert within seconds of a zone entry.

**Ingestion** — RTSP stream input replaces file upload. The zone-tracking pipeline itself (`ZoneTracker`, `homography_utils`) barely changes — it's already frame-by-frame and source-agnostic; the new surface is a stream-reader pulling frames continuously instead of `cv2.VideoCapture` reading a finished file.

**Inference cadence** — Sampled (e.g. 2-5 fps, not native 25-30fps) rather than every frame — the actual cost driver that got this stage deferred in the first place. Zone dwell-time math and intrusion detection both tolerate this resolution fine.

**Alerting** — `ZoneTracker`'s "entered" events fan out to a webhook (cheapest to build, composes with email/SMS/Slack behind it) instead of just appending to a job's event log. Alerts carry a snapshot frame + timestamp + zone.

**Live dashboard** — WebSocket-based real-time occupancy view, a genuinely different frontend interaction model from Stage 0/1's upload-and-review flow.

**Edge inference** — Open question, not a commitment: running inference on-prem instead of streaming raw video to the cloud cuts bandwidth cost and keeps footage on-site — worth real evaluation when this stage actually starts, not speculative architecture now.

**Audit trail** — Per-camera incident timeline (every entry/exit event + snapshot), queryable after the fact.

## Invariants

- No facial recognition or biometric identification, at any stage.
- Secrets are environment variables only; never committed.
- Every stage's exit criteria must be independently verifiable — no stage depends on a later stage existing to be considered "done."
- Backend compute host is an open Stage 1 item: Google Cloud Run was the pick (real headroom, generous free quota) but billing-account verification has failed twice for this account. Azure Container Apps and Railway's trial are the live alternatives, to be resolved when Stage 1 implementation actually starts.
