import React from 'react';
import { type VideoTransforms } from '../lib/api';

interface TransformsPanelProps {
  transforms: VideoTransforms;
  onChange: (t: VideoTransforms) => void;
}

interface ToggleRowProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: string;
  id: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, sublabel, checked, onChange, icon, id }) => (
  <label
    htmlFor={id}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      cursor: 'pointer',
    }}
  >
    <span style={{ fontSize: '1.1rem', width: 24, textAlign: 'center' }}>{icon}</span>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{label}</div>
      {sublabel && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{sublabel}</div>}
    </div>
    {/* Toggle switch */}
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked
          ? 'linear-gradient(135deg, #06b6d4, #8b5cf6)'
          : 'rgba(255,255,255,0.12)',
        position: 'relative',
        transition: 'all 0.25s',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white',
        transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
    <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
  </label>
);

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  id: string;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, value, min, max, step, unit, onChange, disabled, id }) => (
  <div style={{ paddingLeft: 36, marginBottom: 10, opacity: disabled ? 0.4 : 1 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <label htmlFor={id} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{label}</label>
      <span style={{ fontSize: '0.72rem', color: '#06b6d4', fontWeight: 700 }}>{value}{unit}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min} max={max} step={step}
      value={value}
      disabled={disabled}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{
        width: '100%',
        height: 4,
        accentColor: '#06b6d4',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    />
  </div>
);

export const TransformsPanel: React.FC<TransformsPanelProps> = ({ transforms, onChange }) => {
  const set = (key: keyof VideoTransforms) => (val: unknown) => onChange({ ...transforms, [key]: val as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        🛡️ Anti-Detection Transforms
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* 1. Mirror */}
        <ToggleRow
          id="tf-mirror"
          icon="🔄"
          label="Mirror (Flip Horizontal)"
          sublabel="Flips pixels — most effective basic trick"
          checked={!!transforms.mirror}
          onChange={set('mirror')}
        />

        {/* 2. Scale & Crop */}
        <ToggleRow
          id="tf-scale-crop"
          icon="✂️"
          label="Scale & Crop Edges"
          sublabel="Crop borders & zoom in to shift pixel grid"
          checked={!!transforms.scaleCrop}
          onChange={set('scaleCrop')}
        />
        <SliderRow
          id="sl-crop-amount"
          label="Crop amount"
          value={transforms.scaleCropAmount ?? 5}
          min={2} max={15} step={1} unit="%"
          disabled={!transforms.scaleCrop}
          onChange={set('scaleCropAmount')}
        />

        {/* 3. Color Grading */}
        <ToggleRow
          id="tf-color"
          icon="🎨"
          label="Color Grading"
          sublabel="Shift contrast, saturation & warm/cool tint"
          checked={!!transforms.colorGrade}
          onChange={set('colorGrade')}
        />
        <SliderRow
          id="sl-contrast"
          label="Contrast"
          value={transforms.contrast ?? 1.03}
          min={0.9} max={1.2} step={0.01} unit="x"
          disabled={!transforms.colorGrade}
          onChange={set('contrast')}
        />
        <SliderRow
          id="sl-saturation"
          label="Saturation"
          value={transforms.saturation ?? 1.08}
          min={0.8} max={1.5} step={0.01} unit="x"
          disabled={!transforms.colorGrade}
          onChange={set('saturation')}
        />
        <SliderRow
          id="sl-warmth"
          label="Warmth (hue shift)"
          value={transforms.warmth ?? 3}
          min={-15} max={15} step={1} unit="°"
          disabled={!transforms.colorGrade}
          onChange={set('warmth')}
        />

        {/* 4. Frame Rate */}
        <ToggleRow
          id="tf-fps"
          icon="🎞️"
          label="Frame Rate Shift"
          sublabel="Re-encode at slightly different FPS"
          checked={!!transforms.frameRateShift}
          onChange={set('frameRateShift')}
        />
        <div style={{ paddingLeft: 36, marginBottom: 10, opacity: transforms.frameRateShift ? 1 : 0.4 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[23.97, 24, 25, 30].map(fps => (
              <button
                key={fps}
                disabled={!transforms.frameRateShift}
                onClick={() => set('targetFps')(fps)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 99,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: transforms.frameRateShift ? 'pointer' : 'not-allowed',
                  borderColor: transforms.targetFps === fps ? '#06b6d4' : 'rgba(255,255,255,0.15)',
                  background: transforms.targetFps === fps ? 'rgba(6,182,212,0.2)' : 'transparent',
                  color: transforms.targetFps === fps ? '#06b6d4' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.2s',
                }}
              >
                {fps}fps
              </button>
            ))}
          </div>
        </div>

        {/* 5. Blur Background */}
        <ToggleRow
          id="tf-blur-bg"
          icon="🖼️"
          label="Blurred Background Frame"
          sublabel="9:16 canvas with blurred background (16:9 source)"
          checked={!!transforms.blurBackground}
          onChange={set('blurBackground')}
        />

        {/* 6. Fade In/Out */}
        <ToggleRow
          id="tf-fade"
          icon="🎬"
          label="Fade In & Fade Out"
          sublabel="Smooth 1-second fade at the beginning and end"
          checked={!!transforms.fadeAudioVideo}
          onChange={set('fadeAudioVideo')}
        />

        {/* Active count badge */}
        {Object.values(transforms).filter(Boolean).length > 0 && (
          <div style={{
            margin: '12px 0',
            padding: '10px 14px',
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 12,
            fontSize: '0.78rem',
            color: '#67e8f9',
          }}>
            ✅ {Object.values(transforms).filter(Boolean).length} transform{Object.values(transforms).filter(Boolean).length > 1 ? 's' : ''} active — will be applied on export
          </div>
        )}
      </div>
    </div>
  );
};
