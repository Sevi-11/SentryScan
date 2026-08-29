# Deploying the frontend to Vercel

No code changes needed — Vercel supports Next.js natively. This repo is a monorepo, so the only thing to set
is the project's root directory.

1. https://vercel.com/new → import this GitHub repo.
2. **Root Directory**: `frontend` (Vercel auto-detects Next.js and fills in the build/output settings once
   this is set — leave those as default).
3. **Environment Variables**: add `NEXT_PUBLIC_API_URL` = the backend's deployed URL, e.g.
   `https://<your-username>-sentryscan-backend.hf.space` (see [../backend/DEPLOY.md](../backend/DEPLOY.md)).
   No trailing slash.
4. Deploy. Vercel gives you a `*.vercel.app` URL — set that as `ALLOWED_ORIGIN` in the backend Space's
   secrets (see backend/DEPLOY.md) so the browser is allowed to call the API cross-origin.

Any push to the connected branch redeploys automatically.
