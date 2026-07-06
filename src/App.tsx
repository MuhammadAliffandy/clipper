/* eslint-disable react-hooks/refs */
import { useState, useEffect } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { ToastContainer } from './components/ToastContainer';
import { AiClipsPanel } from './components/AiClipsPanel';
import { AiChatPanel } from './components/AiChatPanel';
import { TransformsPanel } from './components/TransformsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel, type AppSettings } from './components/SettingsPanel';
import { useToast } from './hooks/useToast';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import {
  uploadVideo, transcribeVideo, detectNiche, exportClip,
  downloadYouTubeVideoWithProgress, getAiClipSuggestions, chatWithAI,
  type TranscriptResult, type NicheResult, type AiClipSuggestion, type ChatMessage,
  type VideoTransforms, type YTProgressData
} from './lib/api';
import {
  Play, Pause, Download, Scissors,
  Loader2, Sparkles, Video, MessageSquare, Settings, Wand2,
  History, Plus
} from 'lucide-react';

type SidebarTab = 'clips' | 'chat' | 'transforms' | 'settings' | 'history';

function App() {
  const { toasts, success, error, info } = useToast();

  // Source state
  const [, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loadedYoutubeUrl, setLoadedYoutubeUrl] = useState<string | null>(null);
  const [ytProgress, setYtProgress] = useState<(YTProgressData & { status: string }) | null>(null);

  // Processing state
  const [isUploading, setIsUploading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingAiClips, setIsLoadingAiClips] = useState(false);
  const [exportingClipId, setExportingClipId] = useState<string | null>(null);

  // Results
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);
  const [niche, setNiche] = useState<NicheResult | null>(null);
  const [aiClips, setAiClips] = useState<AiClipSuggestion[]>([]);

  // Editor settings
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [transforms, setTransforms] = useState<VideoTransforms>({});
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('clipper_settings');
    if (saved) return JSON.parse(saved);
    return {
      addIntroHook: true,
      ttsEngine: 'elevenlabs',
      llmSource: 'ollama',
      groqApiKey: '',
      elevenLabsApiKey: '',
      openRouterApiKey: '',
      youtubeApiKey: ''
    };
  });
  const [activeTab, setActiveTab] = useState<SidebarTab>('clips');
  const [isLoaded, setIsLoaded] = useState(false);

  const player = useVideoPlayer();
  // ── Persistence ───────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const cached = localStorage.getItem('clipper_project_state');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.fileId) setFileId(data.fileId);
        if (data.youtubeUrl) setYoutubeUrl(data.youtubeUrl);
        if (data.loadedYoutubeUrl) setLoadedYoutubeUrl(data.loadedYoutubeUrl);
        if (data.transcript) setTranscript(data.transcript);
        if (data.niche) setNiche(data.niche);
        if (data.aiClips) setAiClips(data.aiClips);
        if (data.aspectRatio) setAspectRatio(data.aspectRatio);
        if (data.burnSubtitles !== undefined) setBurnSubtitles(data.burnSubtitles);
        if (data.transforms) setTransforms(data.transforms);
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
        if (data.activeTab && data.activeTab !== 'clips') setActiveTab(data.activeTab); // Don't persist clips tab to sidebar anymore
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
        } else if (data.fileId) {
          // Reconstruct URL if missing but fileId exists
          setVideoUrl(`/api/uploads/${data.fileId}`);
        }
      }
    } catch (e) {
      console.error('Failed to load project state from cache', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      const state = {
        fileId,
        youtubeUrl,
        loadedYoutubeUrl,
        transcript,
        niche,
        aiClips,
        aspectRatio,
        burnSubtitles,
        transforms,
        settings,
        activeTab,
        // Don't cache blob URLs (they start with blob:) as they won't work across sessions.
        // We only cache the videoUrl if it's a relative path (like YouTube download or reconstructed)
        videoUrl: videoUrl?.startsWith('blob:') ? (fileId ? `/api/uploads/${fileId}` : null) : videoUrl,
      };
      localStorage.setItem('clipper_project_state', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save project state to cache', e);
    }
  }, [fileId, youtubeUrl, loadedYoutubeUrl, transcript, niche, aiClips, aspectRatio, burnSubtitles, transforms, settings, activeTab, videoUrl, isLoaded]);

  const handleClearProject = () => {
    localStorage.removeItem('clipper_project_state');
    setFile(null);
    setFileId(null);
    setVideoUrl(null);
    setYoutubeUrl('');
    setLoadedYoutubeUrl(null);
    setTranscript(null);
    setNiche(null);
    setAiClips([]);
    info('Project cleared.');
  };

  const handleLoadUpload = (loadedFileId: string) => {
    handleClearProject();
    setFileId(loadedFileId);
    setVideoUrl(`/api/uploads/${loadedFileId}`);
    setActiveTab('settings');
    success('Video loaded from history!');
  };

  // Sync background video for the blur effect
  useEffect(() => {
    const bg = player.videoRef.current;
    if (!bg) return;
    if (Math.abs(bg.currentTime - player.currentTime) > 0.3) {
      bg.currentTime = player.currentTime;
    }
    if (player.playing && bg.paused) bg.play().catch(() => {});
    else if (!player.playing && !bg.paused) bg.pause();
  }, [player.playing, player.currentTime]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleFileSelect = async (selected: File) => {
    setFile(selected);
    setVideoUrl(URL.createObjectURL(selected));
    setUploadProgress(0);
    setIsUploading(true);
    setTranscript(null); setNiche(null); setAiClips([]);
    try {
      info('Uploading video...');
      const id = await uploadVideo(selected, setUploadProgress);
      setFileId(id);
      setLoadedYoutubeUrl(null);
      success('Upload complete! Click "Transcribe & Analyze" to start AI analysis.');
    } catch (err: any) {
      error(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleYouTubeDownload = async () => {
    if (!youtubeUrl) return;
    setIsUploading(true);
    setVideoUrl(null);
    setTranscript(null); setNiche(null); setAiClips([]);
    setYtProgress({ percent: 0, phase: 'video', downloaded: '', total: '', speed: '', eta: '', status: 'Connecting...' });
    try {
      const id = await downloadYouTubeVideoWithProgress(
        youtubeUrl,
        (data) => setYtProgress(prev => prev ? { ...prev, ...data } : null),
        (message) => setYtProgress(prev => prev ? { ...prev, status: message } : null)
      );
      setFileId(id);
      setVideoUrl(`/api/uploads/${id}`);
      setLoadedYoutubeUrl(youtubeUrl);
      setYoutubeUrl('');
      success('YouTube video downloaded! Click "Transcribe & Analyze" to start.');
    } catch (err: any) {
      error(err.message || 'YouTube download failed');
    } finally {
      setIsUploading(false);
      setYtProgress(null);
    }
  };

  const handleTranscribeAndAnalyze = async () => {
    if (!fileId) return;
    setIsTranscribing(true);
    info('Transcribing audio... this may take 1-2 minutes on first run');
    try {
      const res = await transcribeVideo(fileId, 'en', settings);
      setTranscript(res);
      success('Transcription done! Detecting niche...');

      const nicheRes = await detectNiche(res.text, settings);
      setNiche(nicheRes);
      success(`Niche detected: ${nicheRes.niche}`);
    } catch (err: any) {
      error(err.message || 'Analysis failed');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFetchAiClips = async () => {
    if (!transcript) { error('Please transcribe the video first!'); return; }
    setIsLoadingAiClips(true);
    info('AI is scanning for the best clips...');
    try {
      const clips = await getAiClipSuggestions(
        transcript.text,
        transcript.words,
        niche?.niche || 'general',
        transcript.duration,
        settings
      );
      if (clips.length === 0) {
        error('AI returned no clips. Check that Ollama is running and try again.');
      } else {
        setAiClips(clips);
        success(`Found ${clips.length} clip${clips.length > 1 ? 's' : ''}! Click Preview or Export on any card.`);
      }
    } catch (err: any) {
      error(err.message || 'AI clip suggestions failed — check backend logs.');
    } finally {
      setIsLoadingAiClips(false);
    }
  };

  const handleApplyClip = (start: number, end: number) => {
    player.setStart(start);
    player.setEnd(end);
    player.seekTo(start);
    info(`Clip range set: ${formatTime(start)} → ${formatTime(end)}`);
  };

  const handleExportClip = async (start?: number, end?: number, title?: string, addIntroHook?: boolean, introHookText?: string) => {
    if (!fileId) return;
    const s = start ?? player.clipRange.start;
    const e = end ?? player.clipRange.end;
    const clipKey = `${s}-${e}`;

    if (start !== undefined) setExportingClipId(clipKey);
    else setIsExporting(true);

    const activeTransforms = Object.values(transforms).some(Boolean);
    info(`Exporting clip${activeTransforms ? ' with transforms' : ''}...`);
    try {
      const res = await exportClip({
        fileId,
        start: s,
        end: e,
        aspectRatio,
        burnSubtitles,
        words: transcript?.words?.filter(w => w.start >= s && w.end <= e) || [],
        transforms,
        addIntroHook: addIntroHook !== undefined ? addIntroHook : settings.addIntroHook,
        introHookText,
        ttsEngine: settings.ttsEngine,
        elevenLabsApiKey: settings.elevenLabsApiKey,
        // Also send api keys to the backend
        groqApiKey: settings.groqApiKey,
        openRouterApiKey: settings.openRouterApiKey
      });
      success(`Clip ready: ${title || 'exported'}!`);
      const link = document.createElement('a');
      link.href = res.downloadUrl; // relative path goes through Vite proxy
      link.download = res.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      error(err.message || 'Export failed');
    } finally {
      setExportingClipId(null);
      setIsExporting(false);
    }
  };

  const handleUploadYoutube = async (clipIdx: number, scheduledTime?: Date) => {
    if (!fileId) return;
    const clip = aiClips[clipIdx];
    const clipKey = `${clip.start}-${clip.end}`;
    setExportingClipId(clipKey);
    info('Preparing video for YouTube upload...');
    
    try {
      // 1. Export the clip (generate the file on server)
      // Force 9:16 aspect ratio for YouTube Shorts
      const res = await exportClip({
        fileId,
        start: clip.start,
        end: clip.end,
        aspectRatio: '9:16',
        burnSubtitles,
        words: transcript?.words?.filter(w => w.start >= clip.start && w.end <= clip.end) || [],
        transforms,
        addIntroHook: settings.addIntroHook,
        introHookText: clip.title,
        ttsEngine: settings.ttsEngine,
        elevenLabsApiKey: settings.elevenLabsApiKey,
        groqApiKey: settings.groqApiKey,
        openRouterApiKey: settings.openRouterApiKey
      });

      info('Uploading to YouTube...');
      // 2. Upload to YouTube using the generated filename
      const uploadRes = await fetch('/api/youtube-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: res.filename, // send the filename returned by export
          title: clip.title,
          description: loadedYoutubeUrl 
            ? `${clip.description_en}\n\n${niche?.keywords?.map(k => '#' + k.replace(/\\s+/g, '')).join(' ') || ''}\n\nOriginal Video: ${loadedYoutubeUrl}`
            : `${clip.description_en}\n\n${niche?.keywords?.map(k => '#' + k.replace(/\\s+/g, '')).join(' ') || ''}`,
          tags: [...(clip.tags_en || []), ...(niche?.keywords || [])],
          scheduledTime: scheduledTime?.toISOString()
        })
      });

      if (uploadRes.status === 401) {
        // Needs OAuth login
        const data = await uploadRes.json();
        const authRes = await fetch('/api/youtube/auth-url');
        const { url } = await authRes.json();
        if (url) {
          window.location.href = url; // Redirect to Google Login
          return;
        }
        throw new Error(data.error || 'Authentication required');
      }

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || 'Failed to upload to YouTube');
      }

      success(scheduledTime ? `Clip scheduled for ${scheduledTime.toLocaleString()}!` : 'Clip uploaded successfully to YouTube!');
    } catch (err: any) {
      error(err.message || 'YouTube upload failed');
      throw err;
    } finally {
      setExportingClipId(null);
    }
  };

  const handleChat = async (message: string, history: ChatMessage[]): Promise<string> => {
    return chatWithAI(message, transcript?.text || '', niche?.niche || '', history, settings);
  };

  // Current subtitle word at player time
  const currentSubtitle = transcript?.words?.find(
    w => player.currentTime >= w.start && player.currentTime <= w.end
  )?.word || '';

  // ── CSS Live Preview for Transforms ─────────────────────────────────────
  const isBlurBg = aspectRatio === '9:16' && transforms.blurBackground;

  const videoFilter = transforms.colorGrade
    ? `contrast(${transforms.contrast ?? 1.03}) saturate(${transforms.saturation ?? 1.08}) hue-rotate(${transforms.warmth ?? 3}deg)`
    : 'none';

  const videoTransform = [
    transforms.mirror ? 'scaleX(-1)' : '',
    transforms.scaleCrop ? `scale(${1 + (transforms.scaleCropAmount ?? 5) / 100})` : ''
  ].filter(Boolean).join(' ') || 'none';

  const showHookOverlay = player.currentTime < 3 && settings.addIntroHook;

  return (
    <div className={`app-layout ${activeTab !== 'clips' ? 'layout-full-panel' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="app-sidebar">
        <div style={{
          fontSize: '1.4rem', fontWeight: 900,
          color: 'white',
          marginBottom: 8
        }}>C</div>
        <button
          className={`sidebar-icon ${activeTab === 'clips' ? 'active' : ''}`}
          onClick={() => setActiveTab('clips')}
          title="AI Clips & Transcription"
        >
          <Scissors size={20} />
        </button>
        <button
          className={`sidebar-icon ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          title="AI Chat"
        >
          <MessageSquare size={20} />
        </button>
        <button
          className={`sidebar-icon ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          title="Library & History"
        >
          <History size={20} />
        </button>
        <button
          className={`sidebar-icon ${activeTab === 'transforms' ? 'active' : ''}`}
          onClick={() => setActiveTab('transforms')}
          title="Anti-Detection Transforms"
        >
          <Wand2 size={20} />
        </button>
        <button
          className={`sidebar-icon ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title="Export Settings"
        >
          <Settings size={20} />
        </button>
      </aside>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="logo">Clipper</div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>AI Video Studio</div>
        <div className="header-spacer" />
        
        {/* New Project Button */}
        {videoUrl && (
          <button
            className="btn"
            onClick={handleClearProject}
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              marginRight: '10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white'
            }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            New Project
          </button>
        )}
        {niche && (
          <div className="header-badge">
            <div className="status-dot" />
            {niche.niche}
          </div>
        )}
        {transcript && !niche && (
          <div className="header-badge">
            <div className="status-dot" style={{ background: '#f59e0b', boxShadow: '0 0 10px #f59e0b' }} />
            Transcript Ready
          </div>
        )}
      </header>

      {/* ── Main Area ── */}
      <main className="app-main">
        {!videoUrl ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 20,
            width: '100%', maxWidth: 580, margin: 'auto', padding: '0 20px'
          }}>
            {/* YouTube Input */}
            <div className="glass-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Video size={22} color="#06b6d4" />
              <input
                id="youtube-url-input"
                type="text"
                placeholder="Paste YouTube link here..."
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleYouTubeDownload()}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '0.95rem' }}
                disabled={isUploading}
              />
              <button
                id="btn-youtube-download"
                className="btn btn-primary"
                onClick={handleYouTubeDownload}
                disabled={!youtubeUrl || isUploading}
                style={{ padding: '10px 20px', borderRadius: 12 }}
              >
                {isUploading && !ytProgress ? <Loader2 size={16} className="lucide-spinner" /> : 'Download'}
              </button>
            </div>

            {/* ── YouTube Download Progress Card ── */}
            {ytProgress && (
              <div className="glass-card yt-progress-card" style={{ flexDirection: 'column', gap: 14, padding: '18px 20px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={14} className="lucide-spinner" style={{ color: '#06b6d4' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                      {ytProgress.status || 'Downloading...'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '1rem', fontWeight: 800,
                    color: 'white'
                  }}>
                    {ytProgress.percent.toFixed(1)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 99, height: 10, overflow: 'hidden',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)'
                }}>
                  <div style={{
                    background: 'white',
                    borderRadius: 99,
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: '0 0 14px rgba(255,255,255,0.55)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Shimmer */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                      animation: 'shimmer 1.6s infinite',
                    }} />
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Downloaded</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                      {ytProgress.downloaded || '—'}
                    </div>
                    {ytProgress.total && ytProgress.total !== 'Unknown' && (
                      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>of {ytProgress.total}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Speed</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                      {ytProgress.speed || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 4px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>ETA</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                      {ytProgress.eta && ytProgress.eta !== 'Unknown' ? ytProgress.eta : '—'}
                    </div>
                  </div>
                </div>

                {/* Phase pills */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  {(['video', 'audio', 'merging'] as const).map(phase => {
                    const isActive = ytProgress.phase === phase;
                    const labels = { video: '📹 Video', audio: '🎵 Audio', merging: '⚡ Merging' };
                    return (
                      <div key={phase} style={{
                        padding: '3px 12px', borderRadius: 99,
                        fontSize: '0.68rem', fontWeight: 600,
                        background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.08)'}`,
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.28)',
                        transition: 'all 0.35s ease',
                        boxShadow: isActive ? '0 0 10px rgba(255,255,255,0.3)' : 'none',
                      }}>
                        {labels[phase]}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: 2 }}>— OR —</div>

            <VideoUploader onFileSelect={handleFileSelect} disabled={isUploading} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 16, padding: '0 4px' }}>
            {/* Video Player */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              <div style={{
                position: 'relative',
                height: '100%',
                maxWidth: '100%',
                aspectRatio: '9/16', // Always stand position (vertical phone layout)
                background: '#0a0a0a', // Black background for the phone frame
                borderRadius: 16,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {/* Background Blur Video (only for 9:16 blur feature) */}
                {isBlurBg && (
                  <video
                    ref={player.videoRef}
                    src={videoUrl ?? undefined}
                    muted
                    playsInline
                    style={{
                      position: 'absolute', width: '100%', height: '100%',
                      objectFit: 'cover',
                      filter: 'blur(20px) brightness(0.65)',
                      transform: 'scale(1.15)', // hide blurry edges
                      zIndex: 0
                    }}
                  />
                )}

                {/* Inner Video Container for the specific aspect ratio */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '16:9' ? '16/9' : '1/1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  zIndex: 1,
                  background: 'black' // The actual video box background
                }}>
                  {/* Main Foreground Video */}
                  <video
                    ref={player.videoRef}
                    src={videoUrl ?? undefined}
                    onLoadedMetadata={player.onLoaded}
                    onTimeUpdate={player.onTimeUpdate}
                    crossOrigin="anonymous"
                    controls={false}
                    playsInline
                    style={{
                      width: '100%', height: '100%',
                      objectFit: isBlurBg ? 'contain' : 'cover',
                      display: 'block',
                      filter: videoFilter,
                      transform: videoTransform,
                      transition: 'filter 0.3s, transform 0.3s',
                      position: 'relative'
                    }}
                  />
                  {showHookOverlay && (
                    <>
                      <div className="hook-gradient-overlay" />
                      <div className="hook-overlay">
                        <div className="hook-text">{settings.addIntroHook ? "WAIT FOR IT..." : "WATCH THIS"}</div>
                      </div>
                    </>
                  )}
                  {burnSubtitles && currentSubtitle && (
                    <div className="subtitle-overlay" style={{ zIndex: 2 }}>{currentSubtitle}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Buttons and AI Clips moved to app-panel clips tab */}

            {/* Timeline */}
            <div style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: '16px 20px',
              flexShrink: 0
            }}>
              {/* Time labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                  {formatTime(player.clipRange.start)}
                </span>
                <button
                  id="btn-play-pause"
                  onClick={player.togglePlay}
                  style={{
                    background: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'black', cursor: 'pointer'
                  }}
                >
                  {player.playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                  {formatTime(player.clipRange.end)}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ position: 'relative', height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${(player.currentTime / (player.duration || 1)) * 100}%`, background: 'rgba(255,255,255,0.2)', borderRight: '2px solid #fff' }} />
                <div style={{
                  position: 'absolute', top: 0, height: '100%',
                  left: `${(player.clipRange.start / (player.duration || 1)) * 100}%`,
                  width: `${((player.clipRange.end - player.clipRange.start) / (player.duration || 1)) * 100}%`,
                  background: 'rgba(255,255,255,0.1)',
                  borderLeft: '3px solid #fff', borderRight: '3px solid #fff'
                }} />
                <input
                  type="range" min={0} max={player.duration || 100} step={0.1}
                  value={player.currentTime}
                  onChange={e => player.seekTo(parseFloat(e.target.value))}
                  style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'crosshair' }}
                />
              </div>

              {/* Clip range inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Start (s)</label>
                  <input type="number" value={player.clipRange.start.toFixed(1)} onChange={e => player.setStart(parseFloat(e.target.value))} step="0.5" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>End (s)</label>
                  <input type="number" value={player.clipRange.end.toFixed(1)} onChange={e => player.setEnd(parseFloat(e.target.value))} step="0.5" style={{ width: '100%' }} />
                </div>
              </div>
            </div>
            {/* Timeline ends here */}
          </div>
        )}
      </main>

      {/* ── Right Panel ── */}
      <aside className={`app-panel ${activeTab === 'clips' ? 'panel-full-width' : ''}`}>

        {/* Clips Tab */}
        {activeTab === 'clips' && (
          <div className="panel-section">
            {!fileId && !isUploading && (
              <div style={{ textAlign: 'center', opacity: 0.5, padding: '40px 0' }}>
                Please upload a video first to use AI features.
              </div>
            )}

            {/* Transcribe Button */}
            {!transcript && fileId && !isUploading && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button
                  id="btn-transcribe"
                  className="btn btn-primary"
                  onClick={handleTranscribeAndAnalyze}
                  disabled={isTranscribing}
                  style={{ margin: '0 auto', minWidth: 280 }}
                >
                  {isTranscribing ? <Loader2 size={16} className="lucide-spinner" /> : <Sparkles size={16} />}
                  {isTranscribing ? 'Transcribing & Analyzing...' : 'Transcribe & Analyze with AI'}
                </button>
              </div>
            )}

            {/* Find Best Clips Button */}
            {transcript && aiClips.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button
                  id="btn-get-ai-clips"
                  className="btn btn-primary"
                  onClick={handleFetchAiClips}
                  disabled={isLoadingAiClips}
                  style={{ margin: '0 auto', minWidth: 280 }}
                >
                  {isLoadingAiClips ? <Loader2 size={16} className="lucide-spinner" /> : <Sparkles size={16} />}
                  {isLoadingAiClips ? 'Finding best clips...' : 'Find Best Clips with AI'}
                </button>
              </div>
            )}

            {/* AI Clips Section */}
            {transcript && (aiClips.length > 0 || isLoadingAiClips) && (
              <div style={{ marginTop: 10 }}>
                <AiClipsPanel
                  clips={aiClips}
                  isLoading={isLoadingAiClips}
                  hasTranscript={!!transcript}
                  onFetchSuggestions={handleFetchAiClips}
                  onApplyClip={handleApplyClip}
                  onExportClip={(s, e, t, h, ht) => handleExportClip(s, e, t, h ?? settings.addIntroHook, ht)}
                  exportingId={exportingClipId}
                  onUploadYoutube={handleUploadYoutube}
                />
              </div>
            )}
          </div>
        )}

        {/* AI Chat Tab */}
        {activeTab === 'chat' && (
          <AiChatPanel
            niche={niche?.niche || ''}
            onSendMessage={handleChat}
          />
        )}
        {/* Transforms Tab */}
        {activeTab === 'transforms' && (
          <TransformsPanel transforms={transforms} onChange={setTransforms} />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <HistoryPanel onLoadUpload={handleLoadUpload} />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <>
            {/* Upload Progress */}
            {isUploading && (
              <div className="panel-section">
                <div className="panel-section-title">Uploading</div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 6, marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {/* Niche info */}
            {niche && (
              <div className="panel-section">
                <div className="panel-section-title"><Sparkles size={14} /> Niche Analysis</div>
                <div style={{ background: '#333', padding: '8px 16px', borderRadius: 99, fontWeight: 800, display: 'inline-block', marginBottom: 8, color: 'white' }}>{niche.niche || 'General'}</div>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginBottom: 8 }}>{niche.summary || 'Video content analysis'}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(niche.keywords || []).map(k => (
                    <span key={k} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, padding: '3px 10px', fontSize: '0.72rem' }}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Settings Component */}
            <SettingsPanel
              settings={settings}
              setSettings={setSettings}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              burnSubtitles={burnSubtitles}
              setBurnSubtitles={setBurnSubtitles}
              hasTranscript={!!transcript}
              transforms={transforms}
              setTransforms={setTransforms}
            />

            <div className="panel-section">
              <button
                id="btn-export-manual"
                className="btn btn-primary btn-full"
                onClick={() => handleExportClip()}
                disabled={!fileId || isExporting || isUploading}
              >
                {isExporting ? <Loader2 size={16} className="lucide-spinner" /> : <Download size={16} />}
                Export Current Clip
              </button>

              <button
                className="btn"
                onClick={handleClearProject}
                style={{
                  marginTop: 20,
                  width: '100%',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
              >
                Clear Project Cache
              </button>
            </div>
          </>
        )}
      </aside>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default App;
