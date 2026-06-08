import React, { useState } from 'react';
import { MonitorPlay, Calendar, X, UploadCloud, Loader2 } from 'lucide-react';

interface YoutubeUploadModalProps {
  clipTitle: string;
  clipDescription: string;
  clipTags: string[];
  onClose: () => void;
  onUpload: (scheduledTime?: Date) => Promise<void>;
}

export const YoutubeUploadModal: React.FC<YoutubeUploadModalProps> = ({
  clipTitle, clipDescription, clipTags, onClose, onUpload
}) => {
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const handleAction = () => {
    onClose();
    if (isScheduling && scheduleDate && scheduleTime) {
      const dt = new Date(`${scheduleDate}T${scheduleTime}`);
      onUpload(dt);
    } else {
      onUpload();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#111', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, width: '90%', maxWidth: 400, padding: 24,
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <MonitorPlay color="#ff0000" size={24} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>YouTube Upload</h2>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>{clipTitle}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clipDescription}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#06b6d4', marginTop: 4 }}>
            {clipTags.map(t => `#${t.replace(/^#/, '')}`).join(' ')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setIsScheduling(false)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
              background: !isScheduling ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: `1px solid ${!isScheduling ? '#fff' : 'rgba(255,255,255,0.1)'}`,
              color: !isScheduling ? '#fff' : '#888', cursor: 'pointer'
            }}
          >
            Upload Now
          </button>
          <button
            onClick={() => setIsScheduling(true)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
              background: isScheduling ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: `1px solid ${isScheduling ? '#fff' : 'rgba(255,255,255,0.1)'}`,
              color: isScheduling ? '#fff' : '#888', cursor: 'pointer'
            }}
          >
            Schedule
          </button>
        </div>

        {isScheduling && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input
              type="date"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              style={{ flex: 1, padding: '8px', borderRadius: 6, background: '#222', border: '1px solid #444', color: '#fff', colorScheme: 'dark' }}
            />
            <input
              type="time"
              value={scheduleTime}
              onChange={e => setScheduleTime(e.target.value)}
              style={{ flex: 1, padding: '8px', borderRadius: 6, background: '#222', border: '1px solid #444', color: '#fff', colorScheme: 'dark' }}
            />
          </div>
        )}

        <button
          onClick={handleAction}
          disabled={isScheduling && (!scheduleDate || !scheduleTime)}
          className="btn-primary btn-full"
          style={{ padding: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8 }}
        >
          {isScheduling ? <Calendar size={16} /> : <UploadCloud size={16} />}
          {isScheduling ? 'Schedule Upload' : 'Upload to YouTube'}
        </button>
      </div>
    </div>
  );
};
