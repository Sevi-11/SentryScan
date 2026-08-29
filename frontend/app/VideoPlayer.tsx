"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VideoPlayerProps = {
  src: string;
  loop?: boolean;
  onTimeUpdate?: (t: number) => void;
  onSeeking?: (t: number) => void;
};

function fmtTime(t: number) {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2.7c0-.9 1-1.4 1.7-.9l8 5.3c.6.4.6 1.4 0 1.8l-8 5.3c-.7.5-1.7 0-1.7-.9V2.7Z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 6h2.5L8 3v10L4.5 10H2V6Z" strokeLinejoin="round" />
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
      <path d="M12.7 3.8a6 6 0 0 1 0 8.4" strokeLinecap="round" />
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 6h2.5L8 3v10L4.5 10H2V6Z" strokeLinejoin="round" />
      <path d="M11 6.2 14.3 9.5M14.3 6.2 11 9.5" strokeLinecap="round" />
    </svg>
  );
}
function FullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M13.5 5.5V3a1 1 0 0 0-1-1H10M2 10.5V13a1 1 0 0 0 1 1h2.5M13.5 10.5V13a1 1 0 0 1-1 1H10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ExitFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M5.5 2v2.5a1 1 0 0 1-1 1H2M10.5 2v2.5a1 1 0 0 0 1 1H14M5.5 14v-2.5a1 1 0 0 0-1-1H2M10.5 14v-2.5a1 1 0 0 1 1-1H14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VideoPlayer({ src, loop, onTimeUpdate, onSeeking }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  }, []);

  const seekToClientX = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !isFinite(v.duration) || v.duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) seekToClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [seekToClientX]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="video-player" ref={containerRef}>
      <video
        ref={videoRef}
        src={src}
        loop={loop}
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrent(t);
          onTimeUpdate?.(t);
        }}
        onSeeking={(e) => onSeeking?.(e.currentTarget.currentTime)}
      />
      <div className="video-controls">
        <button type="button" className="video-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div
          className="video-progress"
          ref={progressRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          tabIndex={0}
          onMouseDown={(e) => {
            draggingRef.current = true;
            seekToClientX(e.clientX);
          }}
          onKeyDown={(e) => {
            const v = videoRef.current;
            if (!v || !isFinite(v.duration)) return;
            if (e.key === "ArrowRight") v.currentTime = Math.min(v.duration, v.currentTime + 5);
            if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 5);
          }}
        >
          <div className="video-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="video-time">
          {fmtTime(current)} / {fmtTime(duration)}
        </span>
        <button type="button" className="video-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <MuteIcon /> : <VolumeIcon />}
        </button>
        <button
          type="button"
          className="video-btn"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}
