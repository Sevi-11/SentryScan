import json
import sqlite3
import time
from contextlib import contextmanager

from .storage import DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                duration_seconds REAL,
                created_at REAL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                points TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                progress_current INTEGER DEFAULT 0,
                progress_total INTEGER DEFAULT 0,
                events TEXT DEFAULT '[]',
                unique_ids INTEGER,
                dwell_records TEXT,
                output_path TEXT,
                error TEXT,
                created_at REAL
            )
        """)


def create_video(video_id, path, width, height, duration_seconds):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO videos (id, path, width, height, duration_seconds, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (video_id, str(path), width, height, duration_seconds, time.time()),
        )


def get_video(video_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return dict(row) if row else None


def create_job(job_id, video_id, points):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO jobs (id, video_id, points, status, created_at) "
            "VALUES (?, ?, ?, 'queued', ?)",
            (job_id, video_id, json.dumps(points), time.time()),
        )


def update_job(job_id, **fields):
    if not fields:
        return
    columns = ", ".join(f"{key} = ?" for key in fields)
    values = list(fields.values()) + [job_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE jobs SET {columns} WHERE id = ?", values)


def get_job(job_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None
