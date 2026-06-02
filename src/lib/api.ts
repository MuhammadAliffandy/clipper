// ─────────────────────────────────────────────────────────────
//  Clipper API client — talks to Express backend at /api/*
// ─────────────────────────────────────────────────────────────

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptResult {
  text: string;
  words: TranscriptWord[];
  language: string;
  duration: number;
}

export interface NicheResult {
  niche: string;
  confidence: number;
  keywords: string[];
  summary: string;
}

export interface ClipResult {
  downloadUrl: string;
  filename: string;
}

export interface AiClipSuggestion {
  title: string;
  start: number;
  end: number;
  reason: string;
  hook: string;
  score: number;
  description_en?: string;
  tags_en?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Upload a video file */
export async function uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('video', file);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).fileId);
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('POST', '/api/upload');
    xhr.send(form);
  });
}

/** Download from YouTube URL */
export async function downloadYouTubeVideo(url: string): Promise<string> {
  const res = await fetch('/api/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `YouTube download failed (${res.status})`);
  }
  return (await res.json()).fileId;
}

export interface YTProgressData {
  percent: number;
  phase: 'video' | 'audio' | 'merging';
  downloaded: string; // e.g. "23.45 MB"
  total: string;      // e.g. "89.36MiB"
  speed: string;      // e.g. "2.13MiB/s"
  eta: string;        // e.g. "00:34"
}

/**
 * Download from YouTube with real-time SSE progress reporting.
 * Uses EventSource (GET /api/youtube-stream?url=...) so the server
 * can push progress events as yt-dlp runs.
 */
export function downloadYouTubeVideoWithProgress(
  url: string,
  onProgress: (data: YTProgressData) => void,
  onStatus: (message: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const src = new EventSource(`/api/youtube-stream?url=${encodeURIComponent(url)}`);

    src.addEventListener('progress', (e: Event) => {
      try { onProgress(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
    });

    src.addEventListener('status', (e: Event) => {
      try { onStatus(JSON.parse((e as MessageEvent).data).message ?? ''); } catch { /* ignore */ }
    });

    src.addEventListener('done', (e: Event) => {
      src.close();
      try { resolve(JSON.parse((e as MessageEvent).data).fileId); }
      catch { reject(new Error('Unexpected response from server')); }
    });

    src.addEventListener('error', (e: Event) => {
      src.close();
      const msg = (e as MessageEvent).data
        ? (() => { try { return JSON.parse((e as MessageEvent).data).message; } catch { return 'Download failed'; } })()
        : 'Connection to server lost';
      reject(new Error(msg));
    });
  });
}

/** Transcribe audio using local Whisper */
export async function transcribeVideo(fileId: string, language = 'en'): Promise<TranscriptResult> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, language }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Transcription failed (${res.status})`);
  return res.json();
}

/** Detect niche from transcript text */
export async function detectNiche(text: string): Promise<NicheResult> {
  const res = await fetch('/api/niche', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Niche detection failed (${res.status})`);
  return res.json();
}

/** Get AI clip suggestions */
export async function getAiClipSuggestions(
  text: string,
  words: TranscriptWord[],
  niche: string,
  duration: number
): Promise<AiClipSuggestion[]> {
  const res = await fetch('/api/ai-clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, words, niche, duration }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `AI clips failed (${res.status})`);
  const data = await res.json();
  return data.clips || [];
}

/** Chat with AI about the video */
export async function chatWithAI(
  message: string,
  transcript: string,
  niche: string,
  chatHistory: ChatMessage[]
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, transcript, niche, chatHistory }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Chat failed (${res.status})`);
  return (await res.json()).reply;
}

export interface VideoTransforms {
  mirror?: boolean;
  scaleCrop?: boolean;
  scaleCropAmount?: number;       // 1–15 percent
  colorGrade?: boolean;
  contrast?: number;              // e.g. 1.03
  saturation?: number;            // e.g. 1.08
  warmth?: number;                // hue shift degrees, e.g. 3
  frameRateShift?: boolean;
  targetFps?: number;             // e.g. 23.97 | 25 | 30
  blurBackground?: boolean;       // 9:16 blur-bg for wide source
  fadeAudioVideo?: boolean;       // 1s fade in/out for video and audio
}

/** Export a clip with optional subtitle burning and transforms */
export async function exportClip(params: {
  fileId: string;
  start: number;
  end: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  burnSubtitles: boolean;
  words?: TranscriptWord[];
  transforms?: VideoTransforms;
  addIntroHook?: boolean;
  introHookText?: string;
}): Promise<ClipResult> {
  const res = await fetch('/api/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Export failed (${res.status})`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// History / File Management
// ─────────────────────────────────────────────────────────────

export interface HistoryFile {
  name: string;
  size: number;
  createdAt: number;
}

export async function getUploadHistory(): Promise<HistoryFile[]> {
  const res = await fetch('/api/files/uploads');
  if (!res.ok) throw new Error('Failed to fetch upload history');
  return res.json();
}

export async function getOutputHistory(): Promise<HistoryFile[]> {
  const res = await fetch('/api/files/output');
  if (!res.ok) throw new Error('Failed to fetch output history');
  return res.json();
}

export async function deleteUploadFile(filename: string): Promise<void> {
  const res = await fetch(`/api/files/uploads/${filename}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete upload file');
}

export async function deleteOutputFile(filename: string): Promise<void> {
  const res = await fetch(`/api/files/output/${filename}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete output file');
}
