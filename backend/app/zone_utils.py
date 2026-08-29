import cv2


def is_inside_zone(point, zone_polygon):
    """
    Returns True if the given (x, y) point is inside the zone polygon.
    point must be in the SAME coordinate space as zone_polygon (warped space, in our case).
    """
    result = cv2.pointPolygonTest(zone_polygon, point, False)
    return result >= 0


def draw_reference_polygon(frame, points, color=(0, 255, 255), thickness=2):
    """
    Draws a polygon on the frame for visual reference.
    Used to show WHERE the calibration/zone region is in the raw camera view,
    purely for human viewing — not used in any actual math.
    """
    pts = points.astype(int)
    cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=thickness)
    return frame
