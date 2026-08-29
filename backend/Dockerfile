FROM python:3.11-slim

# opencv-python needs libGL/glib at runtime even though this API never opens a window.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY yolov8n.pt ./yolov8n.pt

# Cloud Run injects the actual listen port via $PORT (defaults to 8080) —
# shell form so that variable actually expands, unlike exec-form CMD.
EXPOSE 8080
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
