# AI Agent Knowledge Base - Video Clipper Project

## Overview
Video Clipper is an AI-powered web application that automates the creation of short-form content (YouTube Shorts/TikTok) from long-form source videos. It allows users to upload videos (and soon download from YouTube links), transcribe the audio using OpenAI Whisper, detect niches using GPT-4o-mini, and clip/crop the video to vertical formats (9:16) using FFmpeg.

## Tech Stack
### Frontend
- **Framework:** React 19 + Vite
- **Language:** TypeScript
- **Routing:** React Router DOM
- **Video Processing (Client):** FFmpeg.wasm (`@ffmpeg/ffmpeg`)
- **Icons:** Lucide React
- **Upload:** React Dropzone
- **Styling:** Vanilla CSS (as per Antigravity guidelines) or Custom setup

### Backend
- **Framework:** Node.js + Express
- **Language:** TypeScript (`tsx` for dev)
- **Video Processing (Server):** `fluent-ffmpeg` (requires system `ffmpeg` installed)
- **File Uploads:** Multer
- **AI Integration:** OpenAI API (Whisper for audio transcription, GPT-4o-mini for niche detection)

## Architecture & Features
1. **Upload & Ingestion:** User uploads a video. The backend saves it using Multer.
2. **Transcription:** Extract audio via FFmpeg, send to OpenAI Whisper to get word-level timestamps.
3. **Niche Detection:** Send transcript to GPT-4o-mini to categorize the content.
4. **Clipping & Cropping:** User selects start/end times and aspect ratio (e.g., 9:16). The backend uses FFmpeg to crop and trim the video.

## Common Development Patterns
- **API Endpoints:** 
  - `POST /api/upload`: Upload video file.
  - `POST /api/transcribe`: Extract audio and get text via Whisper.
  - `POST /api/niche`: Analyze text with OpenAI.
  - `POST /api/clip`: Trim and crop video via FFmpeg.
- **Environment Variables:**
  - `OPENAI_API_KEY`: Required for transcription and niche detection.
  - `FFMPEG_PATH`: Optional path to ffmpeg binary if not in system PATH.
  - `PORT`: Backend port (default 3001).

## Current & Future Work
- **YouTube Link Support:** We are implementing the ability to fetch a video directly from a YouTube link using `youtube-dl-exec` (a wrapper around `yt-dlp`).
- **Subtitle Burning:** Basic SRT support is planned.
