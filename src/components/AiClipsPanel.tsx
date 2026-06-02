import React, { useState } from 'react';
import { Sparkles, Play, Download, Loader2, ChevronRight, Star } from 'lucide-react';
import { type AiClipSuggestion } from '../lib/api';

interface AiClipsPanelProps {
  clips: AiClipSuggestion[];
  isLoading: boolean;
  hasTranscript: boolean;
  onFetchSuggestions: () => void;
  onApplyClip: (start: number, end: number) => void;
  onExportClip: (start: number, end: number, title: string, addIntroHook?: boolean, introHookText?: string) => void;
  exportingId: string | null;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function ScoreBar({ score }: { score: number }) {
  const stars = Math.round(score / 2);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={10}
          fill={i < stars ? '#f59e0b' : 'transparent'}
          stroke={i < stars ? '#f59e0b' : 'rgba(255,255,255,0.3)'}
        />
      ))}
      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>{score.toFixed(1)}</span>
    </div>
  );
}

export const AiClipsPanel: React.FC<AiClipsPanelProps> = ({
  clips,
  isLoading,
  hasTranscript,
  onFetchSuggestions,
  onApplyClip,
  onExportClip,
  exportingId
}) => {
  const [addIntroHook, setAddIntroHook] = useState(false);

  return (
    <div className="panel-section">
      <div className="panel-section-title">
        <Sparkles size={14} />
        AI Suggested Clips
      </div>

      {!hasTranscript ? (
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
          Transcribe the video first to get AI clip suggestions.
        </p>
      ) : isLoading ? (
        // Loading state — show spinner + animated skeleton cards
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
            <Loader2 size={18} className="btn-spinner" />
            AI is finding the best clips...
          </div>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.07)', animation: `pulse-skeleton ${0.8 + i * 0.2}s ease-in-out infinite` }}>
              <div style={{ height: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 10, width: `${60 + i * 10}%` }} />
              <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 6, width: '90%' }} />
              <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, width: '70%' }} />
            </div>
          ))}
          <style>{`@keyframes pulse-skeleton { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        </div>
      ) : clips.length === 0 ? (
        <button
          className="btn btn-primary btn-full"
          onClick={onFetchSuggestions}
          disabled={isLoading}
          id="btn-ai-clips"
        >
          <Sparkles size={16} />
          Find Best Clips with AI
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* TTS Hook Toggle */}
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer'
          }} onClick={() => setAddIntroHook(!addIntroHook)}>
            <div style={{
              width: 36, height: 20, borderRadius: 10,
              background: addIntroHook ? '#f59e0b' : 'rgba(255,255,255,0.1)',
              position: 'relative',
              transition: 'all 0.2s',
              flexShrink: 0
            }}>
              <div style={{
                position: 'absolute', top: 2, left: addIntroHook ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: 'white',
                transition: 'all 0.2s'
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fbbf24' }}>Add AI Voice Hook Intro</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                Prepend a 3-second hook with TTS audio and yellow text.
              </div>
            </div>
          </div>

          {clips.map((clip, i) => (
            <div
              key={i}
              className="ai-clip-card"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                padding: 14,
                transition: 'all 0.2s',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1.3,
                  flex: 1,
                  paddingRight: 8
                }}>
                  {clip.title}
                </span>
                <span style={{
                  background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                  padding: '2px 8px',
                  borderRadius: 99,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  {formatTime(clip.start)} – {formatTime(clip.end)}
                </span>
              </div>

              {/* Score */}
              <ScoreBar score={clip.score} />

              {/* Hook preview */}
              <p style={{
                fontSize: '0.76rem',
                color: 'rgba(255,255,255,0.55)',
                marginTop: 8,
                lineHeight: 1.5,
                fontStyle: 'italic'
              }}>
                "{clip.hook}"
              </p>

              {/* Reason */}
              <p style={{
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.4)',
                marginTop: 4,
                lineHeight: 1.4
              }}>
                {clip.reason}
              </p>

              {/* English Recommendation */}
              {(clip.description_en || (clip.tags_en && clip.tags_en.length > 0)) && (
                <div style={{
                  marginTop: 10,
                  padding: 10,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Recommendation (EN)
                  </div>
                  {clip.description_en && (
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4, marginBottom: 8 }}>
                      {clip.description_en}
                    </p>
                  )}
                  {clip.tags_en && clip.tags_en.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {clip.tags_en.map((tag, idx) => (
                        <span key={idx} style={{
                          background: 'rgba(6,182,212,0.15)',
                          color: '#06b6d4',
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: '0.65rem',
                          fontWeight: 600
                        }}>
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.08)',
                    color: 'white',
                    padding: '8px',
                    fontSize: '0.78rem',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                  onClick={() => onApplyClip(clip.start, clip.end)}
                  id={`btn-apply-clip-${i}`}
                >
                  <Play size={12} /> Preview
                </button>
                <button
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.78rem',
                    borderRadius: 10,
                  }}
                  onClick={() => onExportClip(clip.start, clip.end, clip.title, addIntroHook, clip.title)}
                  disabled={exportingId === `${clip.start}-${clip.end}`}
                  id={`btn-export-clip-${i}`}
                >
                  {exportingId === `${clip.start}-${clip.end}`
                    ? <Loader2 size={12} className="btn-spinner" />
                    : <Download size={12} />}
                  Export
                </button>
              </div>
            </div>
          ))}

          <button
            style={{
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.2)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.4)',
              padding: '8px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
            onClick={onFetchSuggestions}
            disabled={isLoading}
          >
            <ChevronRight size={14} /> Regenerate Suggestions
          </button>
        </div>
      )}
    </div>
  );
};
