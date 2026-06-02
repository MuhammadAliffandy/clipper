import { useState, useRef, useCallback } from 'react';

export interface ClipRange {
  start: number;   // seconds
  end:   number;   // seconds
}

export function useVideoPlayer() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [clipRange,   setClipRange]   = useState<ClipRange>({ start: 0, end: 0 });

  const onLoaded = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setClipRange({ start: 0, end: v.duration });
  }, []);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    // Loop within clip range
    if (v.currentTime >= clipRange.end) {
      v.currentTime = clipRange.start;
    }
  }, [clipRange.end, clipRange.start]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else           { v.pause(); setPlaying(false); }
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const setStart = useCallback((t: number) => {
    setClipRange((r) => ({ ...r, start: Math.max(0, Math.min(t, r.end - 0.5)) }));
  }, []);

  const setEnd = useCallback((t: number) => {
    setClipRange((r) => ({ ...r, end: Math.min(duration, Math.max(t, r.start + 0.5)) }));
  }, [duration]);

  return {
    videoRef,
    currentTime, duration, playing, clipRange,
    onLoaded, onTimeUpdate, togglePlay, seekTo, setStart, setEnd,
  };
}
