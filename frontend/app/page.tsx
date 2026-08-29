"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import VideoPlayer from "./VideoPlayer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Point = [number, number];

type JobStatus = "idle" | "queued" | "processing" | "done" | "failed";

type ZoneEvent = { frame: number; seconds: number; track_id: number; type: "entered" | "exited" };

type JobResponse = {
  job_id: string;
  status: JobStatus;
  progress: { current: number; total: number };
  events: ZoneEvent[];
  summary?: { unique_ids: number; dwell_records: [number, number][] };
  video_url?: string;
  error?: string;
};

function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <Hero />
      <Ledger />
      <Steps />
      <TryIt />
      <SiteFooter />
    </>
  );
}

function SiteHeader() {
  return (
    <header className="site">
      <span className="wordmark">SentryScan</span>
      <nav className="links">
        <a href="#how">How it works</a>
        <a href="#try">Try it</a>
        <a href="https://github.com/Sevi-11/Human_Detection_and-Tracking">Repository</a>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="stack">
        <span>FastAPI</span>
        <span>Next.js</span>
        <span>YOLOv8</span>
        <span>BoT-SORT</span>
        <span>OpenCV</span>
      </div>
      <p className="credit">SentryScan — Detect. Track. Protect.</p>
    </footer>
  );
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Hero() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mUnique, setMUnique] = useState(0);
  const [mInZone, setMInZone] = useState(0);
  const [mDwell, setMDwell] = useState("0.0s");
  const [clock, setClock] = useState("00:00");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const W = canvas.width;
    const H = canvas.height;
    const zone: Point[] = [
      [W * 0.62, H * 0.22],
      [W * 0.92, H * 0.34],
      [W * 0.82, H * 0.82],
      [W * 0.5, H * 0.68],
    ];

    function pointInPoly(x: number, y: number, poly: Point[]) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

    type Walker = {
      id: number;
      path: Point[];
      t: number;
      speed: number;
      wasIn: boolean;
      enterT: number;
      trail: Point[];
    };

    const TRAIL_LEN = 50;
    const paths: Point[][] = [
      [[40, 80], [W * 0.7, H * 0.5], [W * 0.95, H * 0.9]],
      [[W * 0.1, H * 0.9], [W * 0.55, H * 0.55], [W - 40, H * 0.15]],
      [[W - 60, H * 0.75], [W * 0.5, H * 0.35], [60, 60]],
    ];
    const walkers: Walker[] = [
      { id: 101, path: paths[0], t: 0, speed: 0.00028, wasIn: false, enterT: 0, trail: [] },
      { id: 102, path: paths[1], t: 0.4, speed: 0.00021, wasIn: false, enterT: 0, trail: [] },
      { id: 103, path: paths[2], t: 0.75, speed: 0.00025, wasIn: false, enterT: 0, trail: [] },
    ];

    function lerpPath(path: Point[], t: number): Point {
      t = t % 1;
      const seg = t * (path.length - 1);
      let i = Math.floor(seg);
      let f = seg - i;
      if (i >= path.length - 1) {
        i = path.length - 2;
        f = 1;
      }
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      return [ax + (bx - ax) * f, ay + (by - ay) * f];
    }

    const uniqueIds = new Set<number>();
    let longestDwell = 0;
    const startTime = performance.now();
    let raf = 0;

    function fmtClock(ms: number) {
      const s = Math.floor(ms / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    }

    function drawScene(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(document.body);
      const lineCol = cs.getPropertyValue("--border") || "rgba(10,17,40,0.15)";
      const textCol = cs.getPropertyValue("--text") || "#0A1128";
      const ochre = cs.getPropertyValue("--accent-ochre") || "#B9812B";
      const rust = cs.getPropertyValue("--accent-rust") || "#A6402A";
      const moss = cs.getPropertyValue("--accent-moss") || "#3F6B4A";

      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= W; gx += W / 12) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy <= H; gy += H / 6) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      const anyInside = walkers.some((w) => w.wasIn);
      ctx.beginPath();
      zone.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = (anyInside ? rust.trim() : ochre.trim()) + (anyInside ? "26" : "1a");
      ctx.fill();
      ctx.setLineDash([10, 7]);
      ctx.strokeStyle = anyInside ? rust.trim() : ochre.trim();
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);

      walkers.forEach((w) => {
        if (!reduced) w.t += w.speed;
        const pos = lerpPath(w.path, w.t);
        uniqueIds.add(w.id);
        const isIn = pointInPoly(pos[0], pos[1], zone);
        if (isIn && !w.wasIn) w.enterT = now;
        if (!isIn && w.wasIn) {
          const dwell = (now - w.enterT) / 1000;
          if (dwell > longestDwell) longestDwell = dwell;
        }
        w.wasIn = isIn;

        w.trail.push(pos);
        if (w.trail.length > TRAIL_LEN) w.trail.shift();

        const dotCol = isIn ? rust.trim() : moss.trim();
        for (let ti = 1; ti < w.trail.length; ti++) {
          const [ax, ay] = w.trail[ti - 1];
          const [bx, by] = w.trail[ti];
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = dotCol;
          ctx.globalAlpha = (ti / w.trail.length) * 0.35;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(pos[0], pos[1], 9, 0, Math.PI * 2);
        ctx.fillStyle = dotCol;
        ctx.fill();
        ctx.font = "600 12px Inter, sans-serif";
        ctx.fillStyle = textCol.trim();
        ctx.fillText(`#${w.id}`, pos[0] + 12, pos[1] + 4);
      });

      setMUnique(uniqueIds.size);
      setMInZone(walkers.filter((w) => w.wasIn).length);
      setMDwell(`${longestDwell.toFixed(1)}s`);
      setClock(fmtClock(now - startTime));

      if (!reduced) raf = requestAnimationFrame(drawScene);
    }

    raf = requestAnimationFrame(drawScene);
    if (reduced) drawScene(performance.now());
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Detect. Track. Protect.</p>
        <h1>Nobody crosses unnoticed.</h1>
        <p className="sub">
          SentryScan watches your footage, follows every person who enters the frame, and keeps a
          plain record of where they walked, whether they crossed into the zone you define, and
          how long they stayed there.
        </p>
        <div className="hero-ctas">
          <a className="btn" href="#try">
            Try it on your footage
          </a>
          <a className="btn ghost" href="#how">
            See how it works
          </a>
        </div>
      </div>

      <div className="plate">
        <div className="plate-frame">
          <canvas
            id="scene"
            ref={canvasRef}
            width={1200}
            height={600}
            role="img"
            aria-label="Animated demonstration of the tracking system: dots representing people trace paths across a mapped floor, and one entering the marked zone triggers a log entry"
          />
        </div>
        <div className="plate-caption">
          <span>Fig. 1 — bird&apos;s-eye plot, warped from raw camera coordinates</span>
          <b>{clock}</b>
        </div>
        <div className="metrics">
          <div className="metric">
            <div className="num">{mUnique}</div>
            <div className="label">People tracked</div>
          </div>
          <div className="metric alert">
            <div className="num">{mInZone}</div>
            <div className="label">Currently in zone</div>
          </div>
          <div className="metric">
            <div className="num">{mDwell}</div>
            <div className="label">Longest dwell</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ledger() {
  const ref = useReveal<HTMLElement>();
  const rows: { id: string; d: string; zone: string; enter: string; exit: string; dur: string }[] = [
    { id: "#07", d: "4,28 22,20 38,22 52,9 70,12 96,4", zone: "North gate", enter: "00:03:14", exit: "00:03:42", dur: "28s" },
    { id: "#12", d: "4,6 24,18 40,10 58,26 74,18 96,24", zone: "North gate", enter: "00:04:02", exit: "00:04:59", dur: "57s" },
    { id: "#13", d: "4,16 30,4 50,20 68,6 96,14", zone: "North gate", enter: "00:05:30", exit: "00:05:41", dur: "11s" },
  ];
  return (
    <section className="ledger-section reveal" id="record" ref={ref}>
      <div className="section-head">
        <p className="eyebrow" style={{ margin: "0 0 0.6rem" }}>
          Sample output
        </p>
        <h2>What ends up on the record</h2>
      </div>
      <div className="ledger">
        <div className="ledger-row ledger-head">
          <span>ID</span>
          <span>Path</span>
          <span>Zone</span>
          <span>Entered</span>
          <span>Exited</span>
          <span>Duration</span>
        </div>
        {rows.map((row) => {
          const points = row.d.split(" ");
          const [sx, sy] = points[0].split(",").map(Number);
          const [ex, ey] = points[points.length - 1].split(",").map(Number);
          return (
            <div className="ledger-row" key={row.id}>
              <span className="mono">{row.id}</span>
              <span className="spark">
                <svg viewBox="0 0 100 32" preserveAspectRatio="none">
                  <polyline points={row.d} />
                  <circle cx={sx} cy={sy} r={2.5} />
                  <circle cx={ex} cy={ey} r={2.5} className="end" />
                </svg>
              </span>
              <span>{row.zone}</span>
              <span className="mono">{row.enter}</span>
              <span className="mono">{row.exit}</span>
              <span className="mono strong">{row.dur}</span>
            </div>
          );
        })}
      </div>
      <p className="ledger-note">
        Every row traces back to a person&apos;s own path through the frame — where they walked
        is recorded alongside how long they spent inside the zone.
      </p>
    </section>
  );
}

function Steps() {
  const ref = useReveal<HTMLElement>();
  const steps = [
    { idx: "01", title: "Upload your footage", body: "Drop in a clip from your own camera, no special format or setup required." },
    { idx: "02", title: "Mark the zone", body: "Click a few points on the first frame to trace the area you want watched." },
    { idx: "03", title: "SentryScan runs", body: "Detection, tracking, and the coordinate mapping happen automatically on our end." },
    { idx: "04", title: "Read the record", body: "Get back an annotated video with every path traced, plus a full log of who entered, when, and for how long." },
  ];
  return (
    <section className="steps-section reveal" id="how" ref={ref}>
      <div className="section-head">
        <h2>Four steps, start to finish</h2>
      </div>
      <div className="steps">
        {steps.map((s) => (
          <div className="step" key={s.idx}>
            <span className="idx">{s.idx}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TryIt() {
  const ref = useReveal<HTMLElement>();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(800);
  const [frameHeight, setFrameHeight] = useState(600);

  const [points, setPoints] = useState<Point[]>([]);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [events, setEvents] = useState<ZoneEvent[]>([]);
  const [summary, setSummary] = useState<JobResponse["summary"] | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  const drawZoneCanvas = useCallback(() => {
    const canvas = zoneCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cs = getComputedStyle(document.body);
    const lineCol = cs.getPropertyValue("--border") || "rgba(10,17,40,0.15)";
    const ochre = cs.getPropertyValue("--accent-ochre") || "#B9812B";
    const textCol = cs.getPropertyValue("--text-muted") || "#6b7280";

    ctx.clearRect(0, 0, W, H);

    if (frameImgRef.current) {
      ctx.drawImage(frameImgRef.current, 0, 0, W, H);
      ctx.fillStyle = "rgba(10,17,40,0.55)";
      ctx.fillRect(0, 0, W, 26);
      ctx.font = "500 12px Inter, sans-serif";
      ctx.fillStyle = "#F4F1EA";
      ctx.fillText(`frame 1 of ${fileName || "your video"} — click to place zone points`, 10, 18);
    } else {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.beginPath();
      ctx.moveTo(40, H * 0.6);
      ctx.lineTo(W - 40, H * 0.6);
      ctx.moveTo(W * 0.35, 40);
      ctx.lineTo(W * 0.35, H - 40);
      ctx.stroke();
      ctx.font = "500 13px Inter, sans-serif";
      ctx.fillStyle = textCol.trim();
      ctx.fillText("sample frame — upload a video above to use your own", 52, 30);
    }

    if (points.length > 0) {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (points.length > 2) ctx.closePath();
      ctx.fillStyle = ochre.trim() + "22";
      if (points.length > 2) ctx.fill();
      ctx.strokeStyle = ochre.trim();
      ctx.lineWidth = 2;
      ctx.stroke();
      points.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = ochre.trim();
        ctx.fill();
        ctx.font = "600 12px Inter, sans-serif";
        ctx.fillStyle = textCol.trim();
        ctx.fillText(String(i + 1), x + 9, y - 9);
      });
    }
  }, [points, fileName]);

  useEffect(() => {
    drawZoneCanvas();
  }, [drawZoneCanvas]);

  const uploadVideo = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setVideoId(null);
    frameImgRef.current = null;
    setHasFrame(false);
    setPoints([]);
    setJobId(null);
    setJobStatus("idle");
    setEvents([]);
    setSummary(null);
    setVideoUrl(null);
    setJobError(null);
    setPlaybackTime(0);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE}/api/videos`, { method: "POST", body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${res.status}).`);
      }
      const data = await res.json();
      setVideoId(data.video_id);
      setFrameWidth(data.width);
      setFrameHeight(data.height);

      const canvas = zoneCanvasRef.current;
      if (canvas) {
        canvas.width = data.width;
        canvas.height = data.height;
      }

      const img = new window.Image();
      img.onload = () => {
        frameImgRef.current = img;
        setHasFrame(true);
        drawZoneCanvas();
      };
      img.src = data.frame;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Something went wrong uploading that video.");
    } finally {
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (localUrl) URL.revokeObjectURL(localUrl);
      const url = URL.createObjectURL(file);
      setLocalUrl(url);
      setFileName(file.name);
      uploadVideo(file);
    },
    [localUrl, uploadVideo]
  );

  const changeVideo = useCallback(() => {
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setFileName(null);
    setVideoId(null);
    frameImgRef.current = null;
    setHasFrame(false);
    setPoints([]);
    setZoneError(null);
    setJobId(null);
    setJobStatus("idle");
    setEvents([]);
    setSummary(null);
    setVideoUrl(null);
    setJobError(null);
    setPlaybackTime(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const canvas = zoneCanvasRef.current;
    if (canvas) {
      canvas.width = 800;
      canvas.height = 600;
    }
    setFrameWidth(800);
    setFrameHeight(600);
  }, [localUrl]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (points.length >= 8) return;
    const canvas = zoneCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) * canvas.width) / rect.width);
    const y = Math.round(((e.clientY - rect.top) * canvas.height) / rect.height);
    setPoints((p) => [...p, [x, y]]);
    setZoneError(null);
  };

  const resetPoints = () => {
    setPoints([]);
    setZoneError(null);
    setJobStatus("idle");
    setEvents([]);
    setSummary(null);
    setVideoUrl(null);
    setJobError(null);
    setPlaybackTime(0);
  };

  const runDetection = async () => {
    if (points.length < 3) {
      setZoneError("Mark at least 3 points to define a zone first.");
      return;
    }
    if (!videoId) {
      setZoneError("Upload a video first.");
      return;
    }
    setZoneError(null);
    setJobStatus("queued");
    setProgress({ current: 0, total: 0 });
    setEvents([]);
    setSummary(null);
    setVideoUrl(null);
    setJobError(null);
    setPlaybackTime(0);

    try {
      const res = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, points }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Couldn't start the job (${res.status}).`);
      }
      const data = await res.json();
      setJobId(data.job_id);
    } catch (err) {
      setJobStatus("failed");
      setJobError(err instanceof Error ? err.message : "Couldn't start the job.");
    }
  };

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Lost track of that job (${res.status}).`);
        const data: JobResponse = await res.json();
        if (cancelled) return;
        setJobStatus(data.status);
        setProgress(data.progress);
        setEvents(data.events);
        if (data.status === "done") {
          setSummary(data.summary || null);
          setVideoUrl(data.video_url ? `${API_BASE}${data.video_url}` : null);
        }
        if (data.status === "failed") {
          setJobError(data.error || "The job failed.");
        }
        if ((data.status === "done" || data.status === "failed") && interval) {
          clearInterval(interval);
        }
      } catch (err) {
        if (!cancelled) {
          setJobStatus("failed");
          setJobError(err instanceof Error ? err.message : "Lost track of that job.");
          if (interval) clearInterval(interval);
        }
      }
    };

    interval = setInterval(poll, 1200);
    poll();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [jobId]);

  const progressPct =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  const running = jobStatus === "queued" || jobStatus === "processing";

  const synced = useMemo(() => {
    const stateByTrack = new Map<number, "in" | "out">();
    const visible: ZoneEvent[] = [];
    for (const e of events) {
      if (e.seconds > playbackTime) continue;
      stateByTrack.set(e.track_id, e.type === "entered" ? "in" : "out");
      visible.push(e);
    }
    const inZone = [...stateByTrack.values()].filter((v) => v === "in").length;
    return { visible: visible.reverse().slice(0, 12), inZone, seenSoFar: stateByTrack.size };
  }, [events, playbackTime]);

  return (
    <section className="try-section reveal" id="try" ref={ref}>
      <div className="section-head">
        <h2>Try it on your footage</h2>
      </div>
      <div className="try-grid">
        <div className="card">
          <h3>1. Upload a clip</h3>
          <p className="hint">
            Choose a short video from your own camera. It&apos;s sent to the SentryScan API running
            at <code>{API_BASE}</code> so a real frame can be extracted for zone marking.
          </p>

          {!localUrl && (
            <label
              className={`dropzone${dragging ? " drag" : ""}`}
              htmlFor="fileInput"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4M12 4L7 9M12 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="dz-title">Choose a video</p>
              <p>or drag one here</p>
            </label>
          )}
          <input
            ref={fileInputRef}
            type="file"
            id="fileInput"
            accept="video/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {localUrl && (
            <div className="preview">
              <VideoPlayer src={localUrl} loop />
              <div className="preview-row">
                <div className="file-chip">
                  <span>{uploading ? "Uploading…" : fileName}</span>
                </div>
                <button className="link-btn" type="button" onClick={changeVideo}>
                  Choose another
                </button>
              </div>
              {uploadError && <p className="err" style={{ display: "block" }}>{uploadError}</p>}
            </div>
          )}
        </div>

        <div className="card">
          <h3>2. Mark the zone</h3>
          <p className="hint">
            Click at least three points on the frame below to trace the zone. Each point records
            its own coordinate — the same data the homography step uses to build the map.
          </p>
          <div className="zone-frame" style={{ aspectRatio: `${frameWidth} / ${frameHeight}` }}>
            <canvas
              id="zoneCanvas"
              ref={zoneCanvasRef}
              width={frameWidth}
              height={frameHeight}
              onClick={onCanvasClick}
            />
          </div>
          <div className="coords">
            {points.map((p, i) => (
              <span className="coord-pill" key={i}>
                <b>P{i + 1}</b> {p[0]}, {p[1]}
              </span>
            ))}
          </div>
          <div className="try-actions">
            <button className="btn" type="button" onClick={runDetection} disabled={running || !hasFrame}>
              {running ? "Processing…" : "Run detection"}
            </button>
            <button className="btn ghost" type="button" onClick={resetPoints} disabled={running}>
              Clear points
            </button>
            {zoneError && <p className="err">{zoneError}</p>}
            {jobStatus === "failed" && jobError && <p className="err">{jobError}</p>}
          </div>
        </div>
      </div>

      {running && (
        <div className="processing-panel">
          <div className="live-panel-head">
            <span className="eyebrow">
              <span className="live-dot" />
              SentryScan is watching your footage
            </span>
            <b>{progressPct}%</b>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <p className="processing-note">
            Detecting and tracking every person, then building the record. This can take a
            moment depending on how long your clip is.
          </p>
        </div>
      )}

      {jobStatus === "done" && (
        <div className="result-panel">
          <div className="result-video-col">
            {videoUrl && (
              <VideoPlayer
                src={videoUrl}
                onTimeUpdate={setPlaybackTime}
                onSeeking={setPlaybackTime}
              />
            )}
          </div>
          <div className="result-log-col">
            <div className="live-panel-head">
              <span className="eyebrow">Synced to playback</span>
              <b>{fmtClock(playbackTime)}</b>
            </div>
            <div className="metrics metrics-compact">
              <div className="metric">
                <div className="num">{synced.seenSoFar}</div>
                <div className="label">Tracked so far</div>
              </div>
              <div className="metric alert">
                <div className="num">{synced.inZone}</div>
                <div className="label">In zone</div>
              </div>
              <div className="metric">
                <div className="num">{summary?.unique_ids ?? 0}</div>
                <div className="label">Total unique</div>
              </div>
            </div>
            <div className="record-log">
              {synced.visible.length === 0 && <p className="empty">Press play to follow the record as it happens.</p>}
              {synced.visible.map((e, i) => (
                <div className="entry" key={i}>
                  <span className="stamp">{fmtClock(e.seconds)}</span>
                  <span>
                    ID {e.track_id}{" "}
                    <span className={e.type === "entered" ? "tag-entered" : "tag-exited"}>{e.type}</span> the zone
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
