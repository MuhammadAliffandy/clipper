import { useEffect, useState } from 'react';
import { getUploadHistory, getOutputHistory, deleteUploadFile, deleteOutputFile, type HistoryFile } from '../lib/api';
import { Trash2, Film, Video, Loader2, Play, UploadCloud } from 'lucide-react';
import { useToast } from '../hooks/useToast';

interface HistoryPanelProps {
  onLoadUpload?: (fileId: string) => void;
}

export function HistoryPanel({ onLoadUpload }: HistoryPanelProps) {
  const [uploads, setUploads] = useState<HistoryFile[]>([]);
  const [outputs, setOutputs] = useState<HistoryFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { success, error } = useToast();

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const [ups, outs] = await Promise.all([
        getUploadHistory(),
        getOutputHistory()
      ]);
      setUploads(ups);
      setOutputs(outs);
    } catch (err: any) {
      error(err.message || 'Failed to fetch history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDeleteUpload = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await deleteUploadFile(filename);
      success('File deleted');
      fetchHistory();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteOutput = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await deleteOutputFile(filename);
      success('Clip deleted');
      fetchHistory();
    } catch (err: any) {
      error(err.message);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderFile = (file: HistoryFile, type: 'upload' | 'output') => (
    <div key={file.name} className="glass-card" style={{ marginBottom: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      {type === 'upload' ? <Video size={20} color="#8b5cf6" /> : <Film size={20} color="#ec4899" />}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          {formatSize(file.size)} • {new Date(file.createdAt).toLocaleString()}
        </div>
      </div>
      {type === 'output' && (
        <a 
          href={`/api/output/${file.name}`} 
          target="_blank" 
          rel="noreferrer"
          className="btn" 
          style={{ padding: 6, background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)' }}
          title="Play / Download"
        >
          <Play size={14} />
        </a>
      )}
      {type === 'upload' && onLoadUpload && (
        <button 
          className="btn" 
          style={{ padding: 6, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}
          onClick={() => onLoadUpload(file.name)}
          title="Load Video into Editor"
        >
          <UploadCloud size={14} />
        </button>
      )}
      <button  
        className="btn" 
        style={{ padding: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
        onClick={() => type === 'upload' ? handleDeleteUpload(file.name) : handleDeleteOutput(file.name)}
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.5)' }}>
        <Loader2 size={32} className="btn-spinner" style={{ marginBottom: 16 }} />
        Loading history...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="panel-section">
        <div className="panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><Film size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Exported Clips</span>
          <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>{outputs.length}</span>
        </div>
        {outputs.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px 0' }}>No exported clips yet</div>
        ) : (
          <div>{outputs.map(f => renderFile(f, 'output'))}</div>
        )}
      </div>

      <div className="panel-section" style={{ marginTop: 20 }}>
        <div className="panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><Video size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Uploaded Videos</span>
          <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>{uploads.length}</span>
        </div>
        {uploads.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px 0' }}>No uploads found</div>
        ) : (
          <div>{uploads.map(f => renderFile(f, 'upload'))}</div>
        )}
      </div>
    </div>
  );
}
