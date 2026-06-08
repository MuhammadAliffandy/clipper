import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';
import youtubedl from 'youtube-dl-exec';
import * as googleTTS from 'google-tts-api';
import { WaveFile } from 'wavefile';
import { google } from 'googleapis';
import { pipeline, env } from '@xenova/transformers';
import { Agent as UndiciAgent } from 'undici';

// Force HTTP/1.1 for Groq API calls.
// Node 18+ uses undici (HTTP/2 capable) as its fetch backend.
// Groq throttles HTTP/2 connections with NGHTTP2_ENHANCE_YOUR_CALM.
// allowH2:false tells undici to never negotiate h2 for this pool.
const _groqHttp1Agent = new UndiciAgent({ allowH2: false });
const groqFetch: typeof fetch = (url, init) =>
  fetch(url, { ...init, dispatcher: _groqHttp1Agent } as RequestInit);


env.allowLocalModels = false;

// Load Env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gpt-4o-mini';

// Helper to get LLM Client per request
function getLlmClient(settings: any) {
  if (settings?.llmSource === 'openrouter' && settings?.openRouterApiKey) {
    return {
      client: new OpenAI({
        apiKey: settings.openRouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Clipper' }
      }),
      model: 'meta-llama/llama-3.1-8b-instruct:free'
    };
  }
  return {
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'ollama',
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      timeout: 5 * 60 * 1000,
    }),
    model: OLLAMA_MODEL
  };
}

// Setup directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
const YOUTUBE_TOKENS_PATH = path.join(__dirname, 'youtube_tokens.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TRANSCRIPTS_DIR)) fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

function getYoutubeOauth2Client() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    'http://localhost:3001/api/youtube/oauth2callback'
  );
}

function loadYoutubeTokens() {
  try {
    if (fs.existsSync(YOUTUBE_TOKENS_PATH)) {
      return JSON.parse(fs.readFileSync(YOUTUBE_TOKENS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading youtube tokens:', err);
  }
  return null;
}

function saveYoutubeTokens(tokens: any) {
  try {
    fs.writeFileSync(YOUTUBE_TOKENS_PATH, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('Error saving youtube tokens:', err);
  }
}

// Setup FFmpeg
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

// Middleware
app.use(cors({ origin: '*' })); // Allow all origins for proxy compatibility
app.use(express.json({ limit: '10mb' }));

// Static file serving with proper video streaming headers
const videoStaticOpts = {
  setHeaders: (res: any) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');
  }
};
app.use('/api/output',  express.static(OUTPUT_DIR,  videoStaticOpts));
app.use('/api/uploads', express.static(UPLOAD_DIR, videoStaticOpts));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// ── Helper: convert words to ASS subtitle format ─────────────────
// ASS embeds the style inside the file, so the FFmpeg filter is just
// `subtitles=/path/to/file.ass` — no force_style quoting issues.
function wordsToAss(words: Array<{ word: string; start: number; end: number }>, clipStart: number): string {
  const toAss = (s: number) => {
    const shifted = Math.max(0, s - clipStart);
    const h = Math.floor(shifted / 3600);
    const m = Math.floor((shifted % 3600) / 60);
    const sec = Math.floor(shifted % 60);
    const cs = Math.round((shifted % 1) * 100); // centiseconds
    return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  // Group into lines of ≤5 words
  const groups: typeof words[] = [];
  let group: typeof words = [];
  for (const w of words) {
    group.push(w);
    if (group.length >= 5) { groups.push(group); group = []; }
  }
  if (group.length) groups.push(group);

  const header = `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,1,1,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Smart word joiner — handles:
  //   • Words without leading spaces (Groq Whisper format): "of","conquest" → "of conquest"
  //   • Punctuation that should NOT get a leading space: "." "," "!" "?" ")" etc.
  //   • Words that already contain a leading space (some Whisper variants)
  const joinWords = (ws: typeof words) =>
    ws.reduce((acc, { word }, i) => {
      const w = word; // keep original (may have leading space from some Whisper APIs)
      if (i === 0) return w.trim();
      // If the raw word already starts with a space, use it as-is (no double-space)
      if (w.startsWith(' ')) return acc + w;
      const trimmed = w.trim();
      // Don't add space before punctuation
      if (/^[.,!?;:)\]}''"»…\-]/.test(trimmed)) return acc + trimmed;
      return acc + ' ' + trimmed;
    }, '');

  const events = groups.map(g => {
    const text = joinWords(g).trim();
    return `Dialogue: 0,${toAss(g[0].start)},${toAss(g[g.length-1].end)},Default,,0,0,0,,${text}`;
  }).join('\n');

  return header + events + '\n';
}

// ── Helpers: yt-dlp size parsing ─────────────────────────────────────
function parseYtdlpSize(sizeStr: string): number {
  const m = sizeStr.match(/^(\d+\.?\d*)([KMGT]?i?B)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const units: Record<string, number> = {
    B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4,
    KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4
  };
  return n * (units[m[2]] ?? 1);
}

function formatBytesServer(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ── Helper: wrap text for responsive intro hooks ───────────────────────
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  let lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

// ── Helper: retry on transient HTTP/2 errors (Groq ENHANCE_YOUR_CALM) ──
async function retryOnHttp2Error<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      // Walk the full cause chain — APIConnectionError wraps TypeError wraps ERR_HTTP2_STREAM_ERROR
      const isHttp2Err = (e: any): boolean => {
        if (!e) return false;
        const code = e.code || '';
        const msg  = e.message || '';
        if (
          code === 'ERR_HTTP2_STREAM_ERROR' ||
          code === 'ECONNRESET' ||
          msg.includes('ENHANCE_YOUR_CALM') ||
          msg.includes('socket hang up')
        ) return true;
        return isHttp2Err(e.cause); // recurse
      };
      if (!isHttp2Err(err) || attempt === maxRetries) throw err;
      const waitMs = Math.pow(2, attempt) * 1500; // 1.5s, 3s, 6s
      console.warn(`[Transcription] HTTP/2 throttle (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw new Error('Max retries exceeded');
}

// ── ROUTES ────────────────────────────────────────────────────────────

// 1. Upload video file
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ fileId: req.file.filename });
});

// 2. YouTube Download
app.post('/api/youtube', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing YouTube URL' });
  const fileId = `${uuidv4()}.mp4`;
  const outputPath = path.join(UPLOAD_DIR, fileId);
  try {
    await youtubedl(url, {
      output: outputPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      mergeOutputFormat: 'mp4'
    });
    res.json({ fileId });
  } catch (error: any) {
    console.error('YouTube Download Error:', error);
    res.status(500).json({ error: 'Failed to download YouTube video' });
  }
});

// 2b. YouTube Download with real-time SSE progress
app.get('/api/youtube-stream', async (req, res) => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: 'Missing url query param' }); return; }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const sendEvt = (event: string, data: object) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
  };

  const fileId = `${uuidv4()}.mp4`;
  const outputPath = path.join(UPLOAD_DIR, fileId);
  let proc: any;
  let currentPhase: 'video' | 'audio' | 'merging' = 'video';

  // Kill download if client disconnects early
  req.on('close', () => { try { proc?.kill?.(); } catch {} });

  sendEvt('status', { message: 'Connecting to YouTube...' });

  try {
    // youtubedl() returns an execa child process (PromiseLike + ChildProcess)
    proc = youtubedl(url, {
      output: outputPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      mergeOutputFormat: 'mp4',
    }) as any;

    const parseLine = (raw: string) => {
      // Strip ANSI escape codes
      const line = raw.replace(/\x1B\[[0-9;]*[mGKF]/g, '').trim();
      if (!line) return;

      // Phase detection
      if (line.includes('[download] Destination:')) {
        const isAudio = /\.(m4a|webm|opus|ogg)/.test(line);
        currentPhase = isAudio ? 'audio' : 'video';
        sendEvt('status', { message: isAudio ? 'Downloading audio track...' : 'Downloading video track...' });
        return;
      }
      if (/\[Merger\]|\[ffmpeg\]|\[VideoConvertor\]/.test(line)) {
        currentPhase = 'merging';
        sendEvt('status', { message: 'Merging video & audio...' });
        sendEvt('progress', { percent: 99, phase: 'merging', downloaded: '', total: '', speed: '', eta: '' });
        return;
      }

      // Progress line: [download]  23.5% of   89.36MiB at    2.13MiB/s ETA 00:34
      // Sometimes it has a tilde: [download]  23.5% of ~ 89.36MiB at    2.13MiB/s ETA 00:34
      const m = line.match(
        /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([a-zA-Z0-9.]+)\s+at\s+~?\s*([a-zA-Z0-9.\/]+)\s+ETA\s+([\d:]+)/
      );
      if (m) {
        const percent   = parseFloat(m[1]);
        const totalStr  = m[2];          // e.g. "89.36MiB"
        const speedStr  = m[3];          // e.g. "2.13MiB/s"
        const etaStr    = m[4];          // e.g. "00:34" or "Unknown"
        const totalBytes  = parseYtdlpSize(totalStr);
        const dlBytes     = totalBytes > 0 ? totalBytes * (percent / 100) : 0;
        sendEvt('progress', {
          percent,
          phase: currentPhase,
          downloaded: dlBytes > 0 ? formatBytesServer(dlBytes) : '',
          total: totalStr,
          speed: speedStr,
          eta: etaStr,
        });
      }
    };

    // yt-dlp writes progress to stderr (uses \r to overwrite the same line)
    proc.stdout?.on('data', (d: Buffer) => d.toString().split(/[\r\n]/).forEach(parseLine));
    proc.stderr?.on('data', (d: Buffer) => d.toString().split(/[\r\n]/).forEach(parseLine));

    await proc;

    sendEvt('done', { fileId });
  } catch (err: any) {
    console.error('YouTube SSE Download Error:', err.message);
    sendEvt('error', { message: err.message || 'Failed to download YouTube video' });
  } finally {
    res.end();
  }
});

// 3. Transcribe (Local or Cloud API)
app.post('/api/transcribe', async (req, res) => {
  const { fileId, language, settings } = req.body;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  try {
    const groqKey = settings?.groqApiKey || process.env.GROQ_API_KEY;
    const useGroq = !!groqKey;
    const useOpenAI = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-REPLACE_ME';
    const isCloud = useGroq || useOpenAI;
    const audioExt = isCloud ? 'mp3' : 'wav';
    const audioPath = path.join(UPLOAD_DIR, `${fileId}.${audioExt}`);

    await new Promise((resolve, reject) => {
      let cmd = ffmpeg(filePath);
      if (isCloud) {
        // 32kbps mono 16kHz — 4× smaller than 64kbps stereo, enough for speech
        cmd = cmd.audioCodec('libmp3lame').audioBitrate('32k').audioChannels(1).audioFrequency(16000);
      } else {
        cmd = cmd.toFormat('wav').audioChannels(1).audioFrequency(16000);
      }
      cmd.on('end', resolve).on('error', reject).save(audioPath);
    });

    let text = '';
    let words: any[] = [];

    if (isCloud) {
      const LIMIT_BYTES = 24 * 1024 * 1024; // 24 MB — Groq/OpenAI hard limit is 25 MB
      const BITRATE_BPS = 32 * 1000 / 8;    // 32 kbps in bytes/s

      // ── Step 1: clip audio to safe duration if file is too large ──────
      // At 32kbps mono the file is small, but very long videos (>100min) can exceed 24MB.
      // Simpler and more reliable than chunking: just trim to the max safe duration.
      let sendPath = audioPath;
      const fileSizeBytes = fs.statSync(audioPath).size;

      if (fileSizeBytes > LIMIT_BYTES) {
        const maxSecs = Math.floor(LIMIT_BYTES / BITRATE_BPS); // ~6000s = 100 min
        const clippedPath = `${audioPath}.clipped.mp3`;
        console.log(`[Transcription] Audio ${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB > 24 MB — clipping to first ${maxSecs}s before sending to Groq`);
        await new Promise((resolve, reject) =>
          ffmpeg(audioPath)
            .setDuration(maxSecs)
            .audioCodec('copy')   // already correct format — just cut, no re-encode
            .on('end', resolve)
            .on('error', reject)
            .save(clippedPath)
        );
        if (fs.existsSync(clippedPath)) {
          sendPath = clippedPath;
        } else {
          console.warn(`[Transcription] Warning: Failed to clip audio, falling back to original file.`);
        }
      }

      // ── Step 2: single request to Groq/OpenAI ─────────────────────────
      console.log(`[Transcription] Using ${useGroq ? 'Groq Whisper' : 'OpenAI Whisper'} (${(fs.statSync(sendPath).size / 1024 / 1024).toFixed(1)} MB)...`);
      const client = new OpenAI({
        apiKey: useGroq ? groqKey : process.env.OPENAI_API_KEY,
        baseURL: useGroq ? 'https://api.groq.com/openai/v1' : undefined,
        maxRetries: 3,
        timeout: 5 * 60 * 1000,
        ...(useGroq ? { fetch: groqFetch } : {}),
      });

      const response = await retryOnHttp2Error(() =>
        client.audio.transcriptions.create({
          file: fs.createReadStream(sendPath) as any,
          model: useGroq ? 'whisper-large-v3-turbo' : 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
        }) as any
      );

      // Clean up clipped temp file if we made one
      if (sendPath !== audioPath && fs.existsSync(sendPath)) fs.unlinkSync(sendPath);

      text = response.text;
      words = (response.words || []).map((w: any) => ({
        word: w.word.trim(), start: w.start, end: w.end,
      }));

    } else {
      console.log('[Transcription] Using Local Xenova Whisper (may be slow)...');
      const buffer = fs.readFileSync(audioPath);
      const wav = new WaveFile(buffer);
      wav.toBitDepth('32f');
      let audioData = wav.getSamples(false, Float32Array);
      if (Array.isArray(audioData)) audioData = audioData[0];

      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      
      // Process in 3-minute physical chunks to prevent WebAssembly memory crashes on long videos
      const CHUNK_MINUTES = 3;
      const SAMPLES_PER_CHUNK = 16000 * 60 * CHUNK_MINUTES;
      const totalChunks = Math.ceil(audioData.length / SAMPLES_PER_CHUNK);
      
      for (let i = 0; i < audioData.length; i += SAMPLES_PER_CHUNK) {
        const chunkIndex = Math.floor(i / SAMPLES_PER_CHUNK) + 1;
        console.log(`[Transcription] Processing local chunk ${chunkIndex}/${totalChunks}...`);
        
        const chunkData = audioData.slice(i, i + SAMPLES_PER_CHUNK);
        const chunkStartTime = i / 16000; // offset in seconds
        
        const result = await transcriber(chunkData as Float32Array, {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: 'word'
        }) as any;

        text += result.text + ' ';
        const chunkWords = (result.chunks || []).map((chunk: any) => ({
          word: chunk.text.trim(),
          start: chunk.timestamp[0] + chunkStartTime,
          end: (chunk.timestamp[1] || chunk.timestamp[0] + 0.5) + chunkStartTime
        }));
        words.push(...chunkWords);
      }
    }

    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    res.json({ text, words, language: 'en', duration: words.length ? words[words.length - 1].end : 0 });
  } catch (error: any) {
    console.error('Transcription Error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// 4. Detect Niche
app.post('/api/niche', async (req, res) => {
  const { text, settings } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing transcript text' });

  try {
    const { client, model } = getLlmClient(settings);
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: 'You are an expert content strategist. Analyze the transcript and identify its primary niche/topic. Return ONLY valid JSON with no markdown, no explanation, no extra text.' },
        { role: 'user', content: `Transcript: ${text.slice(0, 3000)}\n\nReturn JSON: {"niche": "Short Niche Name", "confidence": 0.95, "keywords": ["kw1", "kw2"], "summary": "1 sentence summary"}` }
      ],
    });

    const raw = (response.choices[0].message.content || '').trim();

    // ── Robust JSON extraction ────────────────────────────────────────────
    // Small LLMs often add markdown fences, leading text, or trailing commas.
    const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

    let parsed =
      // 1. Direct parse
      tryParse(raw) ||
      // 2. Extract first {...} block (handles leading/trailing prose)
      tryParse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '') ||
      // 3. Strip markdown code fences then parse
      tryParse(raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()) ||
      // 4. Fix trailing commas before } or ] then parse
      tryParse(
        (raw.match(/\{[\s\S]*\}/)?.[0] ?? '')
          .replace(/,\s*([}\]])/g, '$1')
      ) ||
      // 5. Safe fallback — extract fields individually
      null;

    if (!parsed) {
      // Last resort: build a minimal valid object from the raw string
      const nicheMatch   = raw.match(/"niche"\s*:\s*"([^"]+)"/);
      const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/);
      parsed = {
        niche:      nicheMatch?.[1]   || 'General',
        confidence: 0.7,
        keywords:   [],
        summary:    summaryMatch?.[1] || 'Video content analysis',
      };
      console.warn('[Niche] Could not parse LLM JSON, using extracted fallback:', parsed);
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Niche Error:', error);
    res.status(500).json({ error: 'Niche detection failed' });
  }
});


// ── Helper: auto-generate fallback clips from word timestamps
function generateFallbackClips(words: any[], text: string, totalDuration: number) {
  if (!words || words.length === 0) return [];
  const maxEnd = words[words.length - 1]?.end || totalDuration || 120;
  
  const clips = [];
  const clipLen = 40; // ideal clip length
  const stride = 60; // gap between clips
  
  const fallbackTitles = [
    "Wait For It... 🤯",
    "The Secret Nobody Tells You 🤫",
    "Mind-Blowing Fact 🧠",
    "This Will Change How You Think 💡",
    "Crazy Moment Caught on Camera 🎥",
    "You Won't Believe What Happens Next 😱",
    "The Ultimate Hack 🛠️",
    "Is This Even Real? 😳"
  ];
  
  for (let start = 0; start + 20 < maxEnd; start += stride) {
    const end = Math.min(start + clipLen, maxEnd);
    const textStart = Math.floor((start / maxEnd) * text.length);
    const randomTitle = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
    clips.push({
      title: randomTitle,
      start: start,
      end: end,
      reason: 'Engaging segment from the video',
      hook: text.slice(textStart, textStart + 80) + '...',
      score: 8.0 + (Math.random() * 1.5), // Random score between 8.0 and 9.5
      description_en: 'Watch till the end! This is absolutely insane. 🔥 #viral #fyp #mustwatch',
      tags_en: ['viral', 'trending', 'fyp', 'mustwatch']
    });
  }
  
  return clips.length > 0 ? clips : [{
    title: 'Short Highlight', start: 0, end: maxEnd, reason: 'Entire video', hook: text.slice(0, 80), score: 8.5, description_en: 'Full video highlight!', tags_en: ['highlight']
  }];
}

// 5. AI Auto-Clip Suggestions 🤖
app.post('/api/ai-clips', async (req, res) => {
  const { text, words, niche, duration, settings } = req.body;
  if (!text || !words) return res.status(400).json({ error: 'Missing transcript data' });

  const totalDuration = duration || (words.length ? words[words.length - 1]?.end : 120);

  try {
    const CHUNK_DURATION = 5 * 60; // 5 minutes
    const chunks: { start: number, end: number, text: string, sample: string }[] = [];
    
    // Divide words into chunks
    let currentChunkWords: any[] = [];
    let currentChunkStart = 0;
    
    for (const w of words) {
      if (w.start >= currentChunkStart + CHUNK_DURATION) {
        if (currentChunkWords.length > 0) {
          chunks.push({
            start: currentChunkStart,
            end: currentChunkWords[currentChunkWords.length - 1].end,
            text: currentChunkWords.map((w: any) => w.word).join(' '),
            sample: currentChunkWords.slice(0, 80).map((w: any) => `${w.start.toFixed(1)}s:"${w.word.trim()}"`).join(' ')
          });
        }
        currentChunkStart += CHUNK_DURATION;
        currentChunkWords = [];
      }
      currentChunkWords.push(w);
    }
    if (currentChunkWords.length > 0) {
      chunks.push({
        start: currentChunkStart,
        end: currentChunkWords[currentChunkWords.length - 1].end,
        text: currentChunkWords.map((w: any) => w.word).join(' '),
        sample: currentChunkWords.slice(0, 80).map((w: any) => `${w.start.toFixed(1)}s:"${w.word.trim()}"`).join(' ')
      });
    }

    let allClips: any[] = [];
    const { client, model } = getLlmClient(settings);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[AI-Clips] Processing chunk ${i + 1}/${chunks.length} (${chunk.start.toFixed(0)}s - ${chunk.end.toFixed(0)}s)...`);
      
      const prompt = `You are an elite, viral TikTok and Reels editor. Your ultimate goal is to find highly engaging, high-retention clips from this transcript chunk.
Target Audience Niche: "${niche || 'general'}"
CRITICAL INSTRUCTION: You MUST strictly analyze the text through the lens of the "${niche || 'general'}" niche. Only select clips that provide immense value, shock, or entertainment specifically for this audience!

Chunk Duration: ${(chunk.end - chunk.start).toFixed(0)}s (From ${chunk.start.toFixed(0)}s to ${chunk.end.toFixed(0)}s in the main video)

Transcript sample (with timestamps):
${chunk.sample}

Full text for this chunk:
${chunk.text.slice(0, 30000)}

RULES:
1. Output ONLY a valid JSON array. No markdown, no intro text.
2. Clips MUST be strictly between 30 and 50 seconds long.
3. The title MUST be extremely clickbaity and perfectly tailored to the "${niche || 'general'}" audience. Use emojis!
4. The description MUST include viral hashtags relevant to "${niche || 'general'}".
5. The timestamps (start and end) MUST fall between ${chunk.start.toFixed(0)} and ${chunk.end.toFixed(0)}.
6. The \`reason\` field MUST explain why this clip will go viral in the "${niche || 'general'}" community.

EXAMPLE OUTPUT:
[
  {
    "title": "You Won't Believe This! 😱",
    "start": ${chunk.start + 10},
    "end": ${chunk.start + 45},
    "reason": "High energy hook at the start",
    "hook": "This one secret changed my life forever...",
    "score": 9.5,
    "description_en": "This is insane! Watch till the end. 🔥 #viral #fyp",
    "tags_en": ["viral", "fyp", "trending"]
  }
]

Now generate the JSON array for this chunk:`;

      try {
        const stream = await client.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: 'You are a video clip editor. Respond with a JSON array only, no markdown, no explanation.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 4096,
          stream: true,
        });

        process.stdout.write(`[AI-Clips] Generating chunk ${i + 1}: `);
        let raw = '';
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          raw += token;
          process.stdout.write(token);
        }
        console.log('\n[AI-Clips] Generation complete for chunk', i + 1);

        let chunkClips: any[] = [];
        const strategies = [
          () => { const m = raw.match(/\[[\s\S]*?\]/); return m ? JSON.parse(m[0]) : null; },
          () => { const m = raw.match(/```(?:json)?([\s\S]*?)```/); return m ? JSON.parse(m[1].trim()) : null; },
          () => { try { return JSON.parse(raw); } catch { return null; } },
        ];

        for (const strategy of strategies) {
          try {
            const result = strategy();
            if (Array.isArray(result) && result.length > 0) {
              chunkClips = result;
              break;
            }
          } catch { /* try next */ }
        }
        
        allClips.push(...chunkClips);
      } catch (err) {
        console.error(`[AI-Clips] Chunk ${i + 1} failed:`, err);
      }
    }

    // Validate and fix clips
    let clips = allClips
      .filter(c => c && typeof c.start === 'number' && typeof c.end === 'number')
      .map(c => ({
        title: c.title || 'Clip',
        start: Math.max(0, Math.min(c.start, totalDuration - 30)),
        end: Math.min(Math.max(c.start + 30, c.end), Math.min(c.start + 50, totalDuration)),
        reason: c.reason || 'Interesting segment',
        hook: (c.hook || '').slice(0, 100),
        score: Math.min(10, Math.max(1, c.score || 7)),
        description_en: c.description_en || 'Check out this awesome clip!',
        tags_en: Array.isArray(c.tags_en) ? c.tags_en.slice(0, 10) : ['clip', 'viral']
      }));

    // If model returned nothing useful, generate smart fallbacks from the timestamps
    if (clips.length === 0) {
      console.log('[AI-Clips] Model returned no valid clips, generating smart fallbacks...');
      clips = generateFallbackClips(words, text, totalDuration);
    }

    console.log('[AI-Clips] Returning', clips.length, 'clips');
    res.json({ clips });
  } catch (error: any) {
    console.error('[AI-Clips] Error:', error.message);
    // Even on error, return fallback clips so user always gets something
    const fallback = generateFallbackClips(words, text, duration || 120);
    res.json({ clips: fallback, warning: 'AI unavailable, showing auto-generated clips' });
  }
});

// 6. Chat with AI
app.post('/api/chat', async (req, res) => {
  const { message, transcript, niche, chatHistory, settings } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    const systemPrompt = `You are an AI video assistant for a video clipper tool called Clipper.
You have full context of the video being analyzed.
Video Niche: ${niche || 'Unknown'}
Video Transcript: ${(transcript || '').slice(0, 2000)}

Help the user find the best clips, understand the content, suggest hashtags, titles, captions.
Be concise and actionable. When suggesting clips, always include approximate timestamps.`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory || []).slice(-6), // Keep last 6 messages for context
      { role: 'user', content: message }
    ];

    const { client, model } = getLlmClient(settings);
    const completion = await client.chat.completions.create({ model: model, messages });
    const reply = completion.choices[0].message.content || '';
    res.json({ reply });
  } catch (error: any) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'AI chat failed' });
  }
});

// ── Helper: probe video dimensions ──────────────────────────────
function probeVideo(filePath: string): Promise<{ width: number; height: number; fps: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      const vs = meta.streams.find(s => s.codec_type === 'video');
      if (!vs) return reject(new Error('No video stream found'));
      const fps = eval(vs.r_frame_rate || '30') as number; // e.g. "30000/1001"
      resolve({ width: vs.width || 1920, height: vs.height || 1080, fps: Math.round(fps * 100) / 100 });
    });
  });
}

// 7. Clip, Crop, Burn Subtitles & Anti-Detection Transforms 🎬

// Helper to probe duration specifically for TTS audio
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.ffprobe(filePath, (err: any, meta: any) => {
      if (err) return reject(err);
      resolve(meta.format.duration || 3);
    });
  });
}

// 7. Clip, Crop, Burn Subtitles & Anti-Detection Transforms 🎬
app.post('/api/clip', async (req, res) => {
  const {
    fileId, start, end, aspectRatio, burnSubtitles, words,
    transforms = {},
    addIntroHook = false,
    introHookText = '',
    ttsEngine = 'google',
    elevenLabsApiKey = ''
  } = req.body;

  if (!fileId || start === undefined || end === undefined) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const {
    mirror = false,
    scaleCrop = false,
    scaleCropAmount = 5,
    colorGrade = false,
    contrast = 1.03,
    saturation = 1.08,
    warmth = 3,
    frameRateShift = false,
    targetFps = 25,
    blurBackground = false,
    fadeAudioVideo = false,
  } = transforms;

  const clipDuration = end - start;
  const inputPath = path.join(UPLOAD_DIR, fileId);
  const outFilename = `clip-${uuidv4()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, outFilename);
  
  if (!fs.existsSync(inputPath)) {
    console.error('[exportClip] Input file not found:', inputPath, 'fileId was:', fileId);
    return res.status(404).json({ error: 'Input file not found' });
  }

  // Variables for cleanup
  let srtPath: string | null = null;
  let ttsPath: string | null = null;
  let introVideoPath: string | null = null;
  let mainVideoPath: string | null = null;
  let concatListPath: string | null = null;
  let pass1Output: string | null = null;

  try {
    const probe = await probeVideo(inputPath).catch(() => ({ width: 1920, height: 1080, fps: 30 }));
    const isSourceVertical = probe.height > probe.width;
    const clipWords = (words || []).filter((w: any) => w.start >= start && w.end <= end);

    if (burnSubtitles && clipWords.length > 0) {
      srtPath = path.join(OUTPUT_DIR, `subs-${uuidv4()}.ass`);
      fs.writeFileSync(srtPath, wordsToAss(clipWords, start));
    }

    const needsSubs = !!(srtPath && clipWords.length > 0);
    mainVideoPath = addIntroHook ? path.join(OUTPUT_DIR, `main-${uuidv4()}.mp4`) : outputPath;
    pass1Output = needsSubs ? path.join(OUTPUT_DIR, `tmp-${uuidv4()}.mp4`) : mainVideoPath;

    // Helper to generate filters and options for both main and intro clips
    const buildFiltersAndOpts = (isIntro: boolean) => {
      let vfParts: string[] = [];
      let complexFilterStr = '';
      const opts: string[] = ['-movflags', 'faststart', '-c:v', 'libx264', '-crf', '22', '-preset', 'fast', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];
      
      if (frameRateShift) opts.push('-r', String(targetFps));
      else opts.push('-r', '30'); // ensure consistent fps for concat

      if (aspectRatio === '9:16' && !isSourceVertical && blurBackground) {
        const outW = 1080, outH = 1920;
        const bgChain = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=20:5`;
        const fgParts: string[] = [`scale=${outW}:-2`];
        if (mirror) fgParts.push('hflip');
        if (scaleCrop) {
          const sc = 1 + scaleCropAmount / 100;
          fgParts.push(`scale=iw*${sc.toFixed(3)}:ih*${sc.toFixed(3)}`, `crop=iw/${sc.toFixed(3)}:ih/${sc.toFixed(3)}`);
        }
        if (colorGrade) fgParts.push(`eq=contrast=${contrast}:saturation=${saturation}`, `hue=h=${warmth}`);
        
        complexFilterStr = `[0:v]${bgChain}[bg];[0:v]${fgParts.join(',')}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
        
        if (isIntro) {
          // Escape hook text for FFmpeg drawtext: replace ' with \'
          const maxChars = aspectRatio === '9:16' ? 20 : (aspectRatio === '1:1' ? 25 : 35);
          const textWithoutEmojis = introHookText.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
          const wrappedLines = wrapText(textWithoutEmojis, maxChars);
          const drawtexts = wrappedLines.map((line, i) => {
            const safeText = line.replace(/'/g, "\\'");
            const yExpr = `(h - (${wrappedLines.length} * (w/14) * 1.2))/2 + ${i} * (w/14) * 1.2`;
            return `drawtext=fontfile=/System/Library/Fonts/Supplemental/Impact.ttf:text='${safeText}':fontcolor=yellow:fontsize=(w/14):x=(w-text_w)/2:y=${yExpr}`;
          });
          complexFilterStr += `,${drawtexts.join(',')}`;
        } else if (fadeAudioVideo && clipDuration > 2) {
          complexFilterStr += `,fade=t=in:st=0:d=1,fade=t=out:st=${clipDuration - 1}:d=1`;
          opts.push('-af', `afade=t=in:st=0:d=1,afade=t=out:st=${clipDuration - 1}:d=1`);
        }
      } else {
        if (mirror) vfParts.push('hflip');
        if (scaleCrop) {
          const sc = 1 + scaleCropAmount / 100;
          vfParts.push(`scale=iw*${sc.toFixed(3)}:ih*${sc.toFixed(3)}`, `crop=iw/${sc.toFixed(3)}:ih/${sc.toFixed(3)}`);
        }
        if (aspectRatio === '9:16') {
          vfParts.push(isSourceVertical ? 'scale=iw*1.05:ih*1.05,crop=iw/1.05:ih/1.05' : 'crop=ih*(9/16):ih');
        } else if (aspectRatio === '1:1') {
          vfParts.push('crop=ih:ih');
        }
        if (colorGrade) vfParts.push(`eq=contrast=${contrast}:saturation=${saturation}`, `hue=h=${warmth}`);
        
        if (isIntro) {
          const maxChars = aspectRatio === '9:16' ? 20 : (aspectRatio === '1:1' ? 25 : 35);
          const textWithoutEmojis = introHookText.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
          const wrappedLines = wrapText(textWithoutEmojis, maxChars);
          const drawtexts = wrappedLines.map((line, i) => {
            const safeText = line.replace(/'/g, "\\'");
            const yExpr = `(h - (${wrappedLines.length} * (w/14) * 1.2))/2 + ${i} * (w/14) * 1.2`;
            return `drawtext=fontfile=/System/Library/Fonts/Supplemental/Impact.ttf:text='${safeText}':fontcolor=yellow:fontsize=(w/14):x=(w-text_w)/2:y=${yExpr}`;
          });
          vfParts.push(...drawtexts);
        } else if (fadeAudioVideo && clipDuration > 2) {
          vfParts.push(`fade=t=in:st=0:d=1`, `fade=t=out:st=${clipDuration - 1}:d=1`);
          opts.push('-af', `afade=t=in:st=0:d=1,afade=t=out:st=${clipDuration - 1}:d=1`);
        }
      }
      return { vfParts, complexFilterStr, opts };
    };

    // ── MAIN CLIP GENERATION ──────────────────────────
    const mainCfg = buildFiltersAndOpts(false);
    await new Promise((resolve, reject) => {
      const f = ffmpeg(inputPath).setStartTime(start).setDuration(clipDuration);
      if (mainCfg.complexFilterStr) f.complexFilter(mainCfg.complexFilterStr);
      else if (mainCfg.vfParts.length > 0) mainCfg.opts.push('-vf', mainCfg.vfParts.join(','));
      f.outputOptions(mainCfg.opts)
       .on('start', cl => console.log('[Main Clip]', cl))
       .on('end', resolve).on('error', reject).save(pass1Output!);
    });

    // Subtitle pass for main clip
    if (needsSubs && srtPath) {
      const { spawn } = await import('child_process');
      const ffmpegBin = (ffmpegStatic as string) || process.env.FFMPEG_PATH || 'ffmpeg';
      await new Promise<void>((resolve, reject) => {
        const escapedPath = srtPath!.replace(/\\/g, '/').replace(/:/g, '\\:');
        const args = [
          '-y', '-i', pass1Output!, '-vf', `ass='${escapedPath}'`,
          '-c:v', 'libx264', '-crf', '22', '-preset', 'fast', '-c:a', 'copy', '-movflags', 'faststart', mainVideoPath!
        ];
        console.log('[P2 subs]', ffmpegBin, args.join(' '));
        const proc = spawn(ffmpegBin, args);
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Sub pass failed: ${stderr}`)));
        proc.on('error', reject);
      });
      if (fs.existsSync(pass1Output!)) fs.unlinkSync(pass1Output!);
    }

    // ── INTRO HOOK GENERATION & CONCATENATION ──────────────────────────
    if (addIntroHook && introHookText) {
      console.log('[Intro] Generating TTS...');
      ttsPath = path.join(OUTPUT_DIR, `tts-${uuidv4()}.mp3`);
      
      const apiKey = process.env.ELEVENLABS_API_KEY || elevenLabsApiKey;
      if (ttsEngine === 'elevenlabs' && apiKey) {
        console.log('[Intro] Using ElevenLabs API...');
        try {
          const elRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB', {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': apiKey
            },
            body: JSON.stringify({
              text: introHookText.slice(0, 200),
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
          });
          if (!elRes.ok) throw new Error('ElevenLabs API error: ' + elRes.statusText);
          const buffer = await elRes.arrayBuffer();
          fs.writeFileSync(ttsPath, Buffer.from(buffer));
        } catch (elErr: any) {
          console.error('[Intro] ElevenLabs failed, falling back to Google TTS:', elErr.message);
          const ttsBase64 = await googleTTS.getAudioBase64(introHookText.slice(0, 200), { lang: 'en', slow: false });
          fs.writeFileSync(ttsPath, Buffer.from(ttsBase64, 'base64'));
        }
      } else {
        const ttsBase64 = await googleTTS.getAudioBase64(introHookText.slice(0, 200), { lang: 'en', slow: false });
        fs.writeFileSync(ttsPath, Buffer.from(ttsBase64, 'base64'));
      }
      
      const ttsDuration = await probeDuration(ttsPath);
      const introDuration = Math.ceil(ttsDuration) + 0.5; // add 0.5s padding
      const introStart = Math.max(0, start - introDuration);
      
      introVideoPath = path.join(OUTPUT_DIR, `intro-${uuidv4()}.mp4`);
      const introCfg = buildFiltersAndOpts(true);
      
      console.log(`[Intro] Extracting from ${introStart} for ${introDuration}s`);
      await new Promise((resolve, reject) => {
        const f = ffmpeg(inputPath)
          .setStartTime(introStart)
          .setDuration(introDuration)
          .input(ttsPath!)
          .outputOptions([...introCfg.opts, '-map', '0:v', '-map', '1:a']);
          
        if (introCfg.complexFilterStr) f.complexFilter(introCfg.complexFilterStr);
        else if (introCfg.vfParts.length > 0) f.outputOptions(['-vf', introCfg.vfParts.join(',')]);
        
        f.on('start', cl => console.log('[Intro Clip]', cl))
         .on('end', resolve).on('error', reject).save(introVideoPath!);
      });

      // Concat intro + main
      console.log('[Concat] Joining Intro and Main clip...');
      const { execSync } = require('child_process');
      try {
        const iStreams = execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name -of default=noprint_wrappers=1:nokey=1 "${introVideoPath}"`).toString().trim();
        console.log(`[Debug] Intro streams:\n${iStreams}`);
        const mStreams = execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name -of default=noprint_wrappers=1:nokey=1 "${mainVideoPath}"`).toString().trim();
        console.log(`[Debug] Main streams:\n${mStreams}`);
      } catch(e) {
        console.error('[Debug] ffprobe failed', e);
      }

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(introVideoPath!)
          .input(mainVideoPath!)
          .complexFilter([
            '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]'
          ])
          .outputOptions([
            '-map', '[outv]',
            '-map', '[outa]',
            '-c:v', 'libx264',
            '-crf', '22',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-ar', '44100',
            '-ac', '2',
            '-movflags', 'faststart'
          ])
          .save(outputPath)
          .on('end', resolve)
          .on('error', reject);
      });
    }

    // Cleanup
    const clean = (p: string | null) => p && fs.existsSync(p) && fs.unlinkSync(p);
    clean(srtPath); clean(ttsPath); clean(introVideoPath); clean(concatListPath);
    if (addIntroHook) clean(mainVideoPath);

    res.json({ filename: outFilename, downloadUrl: `/api/output/${outFilename}` });

  } catch (error: any) {
    const clean = (p: string | null) => p && fs.existsSync(p) && fs.unlinkSync(p);
    clean(srtPath); clean(ttsPath); clean(introVideoPath); clean(concatListPath); clean(pass1Output); clean(mainVideoPath);
    console.error('[Clip] Error:', error.message);
    res.status(500).json({ error: 'Video processing failed: ' + error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Clipper Backend running on port ${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// History / File Management Endpoints
// ─────────────────────────────────────────────────────────────

app.get('/api/files/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stats = fs.statSync(path.join(UPLOAD_DIR, f));
        return { name: f, size: stats.size, createdAt: stats.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read uploads directory' });
  }
});

app.get('/api/files/output', (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stats = fs.statSync(path.join(OUTPUT_DIR, f));
        return { name: f, size: stats.size, createdAt: stats.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read output directory' });
  }
});

app.delete('/api/files/uploads/:filename', (req, res) => {
  const filepath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Express Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.delete('/api/files/output/:filename', (req, res) => {
  const filepath = path.join(OUTPUT_DIR, req.params.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// 7. Mock YouTube Upload / Schedule
app.get('/api/youtube/auth-url', (req, res) => {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET is missing in .env' });
  }
  const oauth2Client = getYoutubeOauth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Requests refresh token
    scope: ['https://www.googleapis.com/auth/youtube.upload']
  });
  res.json({ url });
});

app.get('/api/youtube/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');
  
  try {
    const oauth2Client = getYoutubeOauth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    saveYoutubeTokens(tokens);
    res.redirect('http://localhost:5173'); 
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed: ' + err.message);
  }
});

app.post('/api/youtube-upload', async (req, res) => {
  const { filename, title, description, tags, scheduledTime } = req.body;
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'YouTube Client ID/Secret missing in .env.' });
  }

  const tokens = loadYoutubeTokens();
  if (!tokens) {
    return res.status(401).json({ error: 'Not authenticated with YouTube.' });
  }

  const videoPath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found. Export may have failed.' });
  }

  try {
    const oauth2Client = getYoutubeOauth2Client();
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const fileSize = fs.statSync(videoPath).size;

    console.log(`[YouTube] Uploading ${filename}...`);
    const uploadParams: any = {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId: '22' // People & Blogs
        },
        status: {
          privacyStatus: 'private', // default to private for safety
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(videoPath)
      }
    };

    if (scheduledTime) {
      uploadParams.requestBody.status.publishAt = scheduledTime;
    }

    const response = await youtube.videos.insert(uploadParams);
    console.log(`[YouTube] Upload complete! Video ID: ${response.data.id}`);
    
    res.json({ success: true, message: scheduledTime ? 'Scheduled successfully' : 'Uploaded successfully', videoId: response.data.id });
  } catch (err: any) {
    console.error('[YouTube] Upload Error:', err.message);
    res.status(500).json({ error: 'YouTube API Error: ' + err.message });
  }
});
