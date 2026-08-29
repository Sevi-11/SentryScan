import cv2
import numpy as np


def build_homography(src_points, dst_points):
    """
    Solves for the 3x3 homography matrix that maps points from src_points
    (raw pixel space) to dst_points (clean warped/bird's-eye space).
    """
    return cv2.getPerspectiveTransform(src_points, dst_points)


def warp_point(x, y, H):
    """
    Converts a single raw pixel coordinate (x, y) into warped bird's-eye-view
    coordinates, using the homography matrix H.
    """
    point = np.array([[[x, y]]], dtype=np.float32)
    warped = cv2.perspectiveTransform(point, H)
    return float(warped[0][0][0]), float(warped[0][0][1])


def get_foot_point(box):
    """
    Given a bounding box [x1, y1, x2, y2], returns the foot point:
    the bottom-center of the box (more accurate than centroid for angled cameras,
    since feet are what's actually touching the ground plane).
    """
    x1, y1, x2, y2 = box
    foot_x = (x1 + x2) / 2
    foot_y = y2
    return foot_x, foot_y
