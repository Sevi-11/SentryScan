# Deploying to Hugging Face Spaces

This is a Gradio Space — Spaces builds `requirements.txt` and runs `app.py` directly (no Docker needed on
your end; `sdk: gradio` in [README.md](README.md)'s metadata tells Spaces how to run it).

## One-time setup

1. Create a new Space at https://huggingface.co/new-space
   - SDK: **Gradio**
   - Hardware: **CPU basic** (free)
2. Grab the Space's git URL, e.g. `https://huggingface.co/spaces/<your-username>/sentryscan`

## Push this folder to the Space

The Space is its own git repo, and this `space/` folder isn't the root of this monorepo's git history, so
push it as an independent repo:

```bash
cd space
git init
git remote add space https://huggingface.co/spaces/<your-username>/sentryscan
git add .
git commit -m "Deploy SentryScan demo"
git push --force space main
```

(`--force` is safe here since the Space repo starts empty — don't reuse this for anything with real history.)

Push again (`git add . && git commit -m "..." && git push space main`) any time you change files under `space/`.

## Notes

- **Cold start**: the free CPU tier sleeps after inactivity — the first request after a sleep is slow (space
  boot + loading the YOLO model).
- **Speed**: this is CPU-only inference. A full 5-minute clip will take noticeably longer to process than it
  plays back — that's expected, not a bug.
- Nothing here needs `ALLOWED_ORIGIN`/CORS or any other backend env vars — it's a single self-contained app.

## Verify

Once the Space finishes building (check its **Logs** tab), open
`https://huggingface.co/spaces/<your-username>/sentryscan` and run the flow end-to-end: upload a short clip,
click 3+ points on the frame, hit Run, confirm the annotated video and event log come back.
