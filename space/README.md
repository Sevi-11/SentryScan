---
title: SentryScan
emoji: 🛰️
colorFrom: blue
colorTo: indigo
sdk: gradio
app_file: app.py
---

# SentryScan demo

Upload a clip, trace a zone by clicking points on the first frame, and get back an annotated video plus an
entry/exit log — YOLO detects people, BoT-SORT tracks them frame to frame, and a homography maps each
person's foot position into the zone's own coordinate space.

See the root [README.md](../README.md) for how the underlying pipeline works, and [DEPLOY.md](DEPLOY.md) for
how to push this folder to a Space.
