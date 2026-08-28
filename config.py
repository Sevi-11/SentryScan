import numpy as np

# ============================================================
# Paths and basic settings
# ============================================================
VIDEO_PATH = r"C:\Users\Admin\OneDrive\Documents\Person\Personal Projects\Human Tracker\data\sample_vid.mp4"
OUTPUT_PATH = "kill_zone_output.mp4"
MODEL_NAME = "yolov8n.pt"
CLASS_NO = 0  # COCO class ID for "person"
TRACKER = "botsort.yaml"

# ============================================================
# Homography calibration points
# src_points = 4 corners of the zone, as seen in the RAW camera frame (pixel space)
# dst_points = same 4 corners, mapped to a clean rectangle (warped/bird's-eye space)
# ============================================================
SRC_POINTS = np.float32([
    [669, 117],
    [761, 155],
    [690, 205],
    [555, 175]
])

DST_POINTS = np.float32([
    [0, 0],
    [400, 0],
    [400, 600],
    [0, 600]
])

# ============================================================
# Kill zone polygon, in WARPED space.
# Since our kill zone IS the calibration region here, it's simply DST_POINTS.
# ============================================================
KILL_ZONE = np.array([
    [0, 0],
    [400, 0],
    [400, 600],
    [0, 600]
], dtype=np.int32)
