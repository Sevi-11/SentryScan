
# Computer Vision - Human tracking using YOLO and BOT sort

import cv2
from ultralytics import YOLO

import config
from homography_utils import build_homography, warp_point, get_foot_point
from zone_utils import draw_reference_polygon
from zone_tracker import ZoneTracker


def main():
    # ---- Setup ----
    model = YOLO(config.MODEL_NAME)
    cap = cv2.VideoCapture(config.VIDEO_PATH)

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    output = cv2.VideoWriter(config.OUTPUT_PATH, fourcc, fps, (width, height))

    H = build_homography(config.SRC_POINTS, config.DST_POINTS)
    tracker_state = ZoneTracker(config.KILL_ZONE, fps)

    frame_count = 0

    # ---- Main loop ----
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        frame_count += 1

        results = model.track(
            frame,
            classes=[config.CLASS_NO],
            tracker=config.TRACKER,
            persist=True,
            verbose=False
        )

        if results[0].boxes.id is not None:
            tracked_ids = results[0].boxes.id.int().tolist()
            boxes_xyxy = results[0].boxes.xyxy.tolist()

            for track_id, box in zip(tracked_ids, boxes_xyxy):
                foot_x, foot_y = get_foot_point(box)
                warped_point = warp_point(foot_x, foot_y, H)
                tracker_state.update(track_id, warped_point, frame_count)

        # ---- Draw everything ----
        annotated_frame = results[0].plot()
        draw_reference_polygon(annotated_frame, config.SRC_POINTS)

        cv2.putText(annotated_frame, f"Unique IDs: {len(tracker_state.unique_ids)}", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.putText(annotated_frame, f"Currently in zone: {tracker_state.currently_in_zone_count()}", (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        output.write(annotated_frame)
        cv2.imshow("Kill Zone Tracking", annotated_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # ---- Wrap up ----
    tracker_state.finalize(frame_count)

    cap.release()
    output.release()
    cv2.destroyAllWindows()

    tracker_state.print_summary()


if __name__ == "__main__":
    main()
