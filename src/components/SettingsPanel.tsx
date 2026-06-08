import React from 'react';
import { TransformsPanel } from './TransformsPanel';
import { type VideoTransforms } from '../lib/api';
import { Layout, Scissors, Wand2, Key, Video, ChevronDown } from 'lucide-react';

export interface AppSettings {
  addIntroHook: boolean;
  ttsEngine: 'google' | 'elevenlabs';
  llmSource: 'ollama' | 'openrouter';
  groqApiKey: string;
  elevenLabsApiKey: string;
  openRouterApiKey: string;
  youtubeApiKey: string;
}

interface SettingsPanelProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  setAspectRatio: (r: '16:9' | '9:16' | '1:1') => void;
  burnSubtitles: boolean;
  setBurnSubtitles: (b: boolean) => void;
  hasTranscript: boolean;
  transforms: VideoTransforms;
  setTransforms: (t: VideoTransforms) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  setSettings,
  aspectRatio,
  setAspectRatio,
  burnSubtitles,
  setBurnSubtitles,
  hasTranscript,
  transforms,
  setTransforms
}) => {
  const [openSection, setOpenSection] = React.useState<string>('output');

  const Section = ({ title, id, icon, children }: any) => (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <button
        onClick={() => setOpenSection(openSection === id ? '' : id)}
        style={{
          width: '100%', padding: '16px 20px', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon} {title}
        </div>
        <ChevronDown size={16} style={{ transform: openSection === id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {openSection === id && (
        <div style={{ padding: '0 20px 20px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
      <Section title="Output Format" id="output" icon={<Video size={16} />}>
        <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: 10, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>Aspect Ratio</label>
        <div className="aspect-grid" style={{ marginBottom: 20 }}>
          {(['9:16', '16:9', '1:1'] as const).map(r => (
            <div key={r} className={`aspect-btn ${aspectRatio === r ? 'selected' : ''}`} onClick={() => setAspectRatio(r)}>
              <Layout size={14} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{r}</span>
            </div>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={burnSubtitles}
            onChange={e => setBurnSubtitles(e.target.checked)}
            disabled={!hasTranscript}
            style={{ width: 16, height: 16, accentColor: '#22c55e' }}
          />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Burn Subtitles</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Auto-generated from transcript</div>
          </div>
        </label>
      </Section>

      <Section title="AI Voice Hook" id="hook" icon={<Scissors size={16} />}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={settings.addIntroHook}
            onChange={e => setSettings({ ...settings, addIntroHook: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: '#22c55e' }}
          />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Add AI Voice Hook Intro</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Prepend a 3-second hook with TTS</div>
          </div>
        </label>

        <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>TTS Engine</label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            className={`aspect-btn ${settings.ttsEngine === 'google' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, ttsEngine: 'google' })}
            style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
          >
            Google TTS
          </button>
          <button
            className={`aspect-btn ${settings.ttsEngine === 'elevenlabs' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, ttsEngine: 'elevenlabs' })}
            style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
          >
            ElevenLabs
          </button>
        </div>
      </Section>

      <Section title="AI Services & API Keys" id="apis" icon={<Key size={16} />}>
        
        <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>LLM Provider</label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            className={`aspect-btn ${settings.llmSource === 'ollama' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, llmSource: 'ollama' })}
            style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
          >
            Local (Ollama)
          </button>
          <button
            className={`aspect-btn ${settings.llmSource === 'openrouter' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, llmSource: 'openrouter' })}
            style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
          >
            Online (OpenRouter)
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 4 }}>Groq API Key (Fast Whisper)</label>
            <input 
              type="password" 
              value={settings.groqApiKey} 
              onChange={e => setSettings({ ...settings, groqApiKey: e.target.value })}
              placeholder="gsk_..." 
              style={{ width: '100%', fontSize: '0.8rem', padding: '8px 12px' }} 
            />
          </div>
          
          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 4 }}>ElevenLabs API Key (HQ Voices)</label>
            <input 
              type="password" 
              value={settings.elevenLabsApiKey} 
              onChange={e => setSettings({ ...settings, elevenLabsApiKey: e.target.value })}
              placeholder="sk_..." 
              style={{ width: '100%', fontSize: '0.8rem', padding: '8px 12px' }} 
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 4 }}>OpenRouter API Key (Online LLM)</label>
            <input 
              type="password" 
              value={settings.openRouterApiKey} 
              onChange={e => setSettings({ ...settings, openRouterApiKey: e.target.value })}
              placeholder="sk-or-v1-..." 
              style={{ width: '100%', fontSize: '0.8rem', padding: '8px 12px' }} 
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 4 }}>YouTube API Key (Auto Upload)</label>
            <input 
              type="password" 
              value={settings.youtubeApiKey} 
              onChange={e => setSettings({ ...settings, youtubeApiKey: e.target.value })}
              placeholder="AIzaSy..." 
              style={{ width: '100%', fontSize: '0.8rem', padding: '8px 12px' }} 
            />
          </div>
        </div>
      </Section>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={() => setOpenSection(openSection === 'transforms' ? '' : 'transforms')}
          style={{
            width: '100%', padding: '16px 20px', background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wand2 size={16} /> Anti-Detection Transforms
          </div>
          <ChevronDown size={16} style={{ transform: openSection === 'transforms' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {openSection === 'transforms' && (
          <TransformsPanel transforms={transforms} onChange={setTransforms} />
        )}
      </div>

    </div>
  );
};
