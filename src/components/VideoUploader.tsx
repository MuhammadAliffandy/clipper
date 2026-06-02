import React from 'react';
import { UploadCloud } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelect, disabled }) => {
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && !disabled) {
      onFileSelect(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/x-matroska': ['.mkv']
    },
    maxFiles: 1,
    disabled
  });

  return (
    <div 
      {...getRootProps()} 
      className={`dropzone ${isDragActive ? 'dragover' : ''} ${disabled ? 'disabled' : ''}`}
      style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
    >
      <input {...getInputProps()} />
      <div className="dropzone-icon">
        <UploadCloud size={32} />
      </div>
      <div>
        <h2>Drop your video here</h2>
        <p>or click to browse from your computer</p>
      </div>
      <div className="dropzone-formats">
        <span className="format-badge">MP4</span>
        <span className="format-badge">MOV</span>
        <span className="format-badge">MKV</span>
      </div>
    </div>
  );
};
