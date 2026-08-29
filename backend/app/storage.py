from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
OUTPUTS_DIR = STORAGE_DIR / "outputs"
DB_PATH = STORAGE_DIR / "app.db"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
MAX_DURATION_SECONDS = 5 * 60  # 5 minutes


def upload_path(video_id: str, ext: str) -> Path:
    return UPLOADS_DIR / f"{video_id}{ext}"


def output_path(job_id: str) -> Path:
    return OUTPUTS_DIR / f"{job_id}.mp4"


def raw_output_path(job_id: str) -> Path:
    """Intermediate file OpenCV writes to, before it's transcoded to H.264 for the browser."""
    return OUTPUTS_DIR / f"{job_id}_raw.mp4"
