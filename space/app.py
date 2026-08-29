import cv2
import gradio as gr
import numpy as np
import pandas as pd

from pipeline import run_pipeline

MAX_DURATION_SECONDS = 5 * 60
MAX_POINTS = 8
POINT_COLOR = (255, 215, 0)  # gold, drawn directly on the RGB preview frame


def _draw_points(frame_rgb, points):
    img = frame_rgb.copy()
    for i, (x, y) in enumerate(points):
        cv2.circle(img, (int(x), int(y)), 6, POINT_COLOR, -1)
        cv2.putText(img, str(i + 1), (int(x) + 8, int(y) - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, POINT_COLOR, 2)
    if len(points) >= 2:
        pts = np.array(points, dtype=np.int32)
        cv2.polylines(img, [pts], isClosed=len(points) >= 3, color=POINT_COLOR, thickness=2)
    return img


def extract_first_frame(video_path):
    if video_path is None:
        return None, [], None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise gr.Error("Couldn't read that file as a video.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration_seconds = frame_count / fps if fps else 0
    if duration_seconds > MAX_DURATION_SECONDS:
        cap.release()
        raise gr.Error(f"Video is longer than the {MAX_DURATION_SECONDS // 60} minute demo limit.")

    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise gr.Error("Couldn't read a frame from that video.")

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return frame_rgb, [], frame_rgb


def add_point(frame, points, evt: gr.SelectData):
    if frame is None:
        raise gr.Error("Upload a video first.")
    if len(points) >= MAX_POINTS:
        gr.Warning(f"That's the {MAX_POINTS}-point limit — clear and start over if you need to redraw.")
        return points, _draw_points(frame, points)

    x, y = evt.index
    points = points + [[x, y]]
    return points, _draw_points(frame, points)


def clear_points(frame):
    if frame is None:
        return [], None
    return [], frame


def process(video_path, frame, points, progress=gr.Progress()):
    if video_path is None:
        raise gr.Error("Upload a video first.")
    if frame is None or len(points) < 3:
        raise gr.Error("Click at least 3 points on the frame to trace the zone.")

    def on_progress(current, total):
        fraction = current / total if total else 0
        progress(fraction, desc=f"Processing frame {current}/{total or '?'}")

    progress(0, desc="Starting…")
    result = run_pipeline(video_path, points, progress_callback=on_progress)

    dwell_lines = "\n".join(
        f"- Person {track_id}: {seconds:.1f}s" for track_id, seconds in result["dwell_records"]
    ) or "- No completed zone visits."
    summary_md = (
        f"**Unique people seen:** {result['unique_ids']}\n\n"
        f"**Completed zone visits:** {len(result['dwell_records'])}\n\n{dwell_lines}"
    )
    events_df = pd.DataFrame(result["events"], columns=["frame", "seconds", "track_id", "type"])

    return result["output_path"], summary_md, events_df


with gr.Blocks(title="SentryScan") as demo:
    gr.Markdown(
        "# SentryScan\n"
        "Detect, track, and log how long people spend in a zone you define. "
        "Upload a clip, click 3–8 points on the first frame to trace the zone, then run it."
    )

    frame_state = gr.State(None)
    points_state = gr.State([])

    with gr.Row():
        with gr.Column():
            video_input = gr.Video(label="1. Upload a clip", sources=["upload"])
            zone_image = gr.Image(label="2. Click points to trace the zone", interactive=False)
            clear_btn = gr.Button("Clear points")
            run_btn = gr.Button("3. Run", variant="primary")
        with gr.Column():
            output_video = gr.Video(label="Annotated output")
            summary_output = gr.Markdown()
            events_output = gr.Dataframe(
                headers=["frame", "seconds", "track_id", "type"],
                label="Entry / exit log",
            )

    video_input.change(
        extract_first_frame,
        inputs=[video_input],
        outputs=[frame_state, points_state, zone_image],
    )
    zone_image.select(
        add_point,
        inputs=[frame_state, points_state],
        outputs=[points_state, zone_image],
    )
    clear_btn.click(
        clear_points,
        inputs=[frame_state],
        outputs=[points_state, zone_image],
    )
    run_btn.click(
        process,
        inputs=[video_input, frame_state, points_state],
        outputs=[output_video, summary_output, events_output],
    )

if __name__ == "__main__":
    demo.launch()
