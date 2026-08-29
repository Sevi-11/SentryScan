from .zone_utils import is_inside_zone


class ZoneTracker:
    """
    Keeps track of, for every person (track_id):
    - whether they were inside the zone last frame
    - what frame they entered on
    - a log of completed (track_id, duration_seconds) visits

    Using a class here (instead of loose global dictionaries) keeps all this
    related state bundled together, and makes it easy to reset or reuse
    for multiple zones later if needed.
    """

    def __init__(self, zone_polygon, fps):
        self.zone_polygon = zone_polygon
        self.fps = fps

        self.was_inside = {}      # track_id -> bool (inside last frame?)
        self.entry_frame = {}     # track_id -> frame number when they entered
        self.dwell_records = []   # list of (track_id, duration_seconds)
        self.unique_ids = set()   # every track_id ever seen

    def update(self, track_id, warped_point, frame_count):
        """
        Call this once per person, per frame, with their current warped foot point.
        Handles entry/exit detection and dwell time logging internally.

        Returns "entered", "exited", or None, so callers can build a live event
        log without duplicating the entry/exit detection logic.
        """
        self.unique_ids.add(track_id)

        currently_inside = is_inside_zone(warped_point, self.zone_polygon)
        previously_inside = self.was_inside.get(track_id, False)
        event = None

        if currently_inside and not previously_inside:
            self.entry_frame[track_id] = frame_count
            event = "entered"

        elif not currently_inside and previously_inside:
            frames_spent = frame_count - self.entry_frame.get(track_id, frame_count)
            duration_seconds = frames_spent / self.fps
            self.dwell_records.append((track_id, duration_seconds))
            event = "exited"

        self.was_inside[track_id] = currently_inside
        return event

    def finalize(self, final_frame_count):
        """
        Call this once, after the video loop ends, to close out anyone
        who was still inside the zone when the video finished.
        """
        for track_id, still_inside in self.was_inside.items():
            if still_inside and track_id in self.entry_frame:
                frames_spent = final_frame_count - self.entry_frame[track_id]
                duration_seconds = frames_spent / self.fps
                self.dwell_records.append((track_id, duration_seconds))

    def currently_in_zone_count(self):
        return sum(self.was_inside.values())
