'use client';

import { useState } from 'react';

interface GradientPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyGradient: (startColor: string, endColor: string) => void;
}

const GRADIENT_PRESETS = [
  { name: 'Red Fade', start: '#4d0000', end: '#ffcccc' },
  { name: 'Fire', start: '#ff0000', end: '#ffff00' },
  { name: 'Sunset', start: '#ff3333', end: '#ff9900' },
  { name: 'Ocean', start: '#003366', end: '#00ccff' },
  { name: 'Gold', start: '#664400', end: '#ffcc00' },
  { name: 'Emerald', start: '#003300', end: '#33ff66' },
  { name: 'Purple', start: '#330066', end: '#cc66ff' },
  { name: 'Ice', start: '#000066', end: '#ccccff' },
];

export function GradientPicker({ isOpen, onClose, onApplyGradient }: GradientPickerProps) {
  const [startColor, setStartColor] = useState('#ff0000');
  const [endColor, setEndColor] = useState('#ffcc00');

  if (!isOpen) return null;

  function handlePresetClick(start: string, end: string) {
    setStartColor(start);
    setEndColor(end);
    onApplyGradient(start, end);
    onClose();
  }

  function handleCustomApply() {
    if (/^#[0-9a-fA-F]{6}$/.test(startColor) && /^#[0-9a-fA-F]{6}$/.test(endColor)) {
      onApplyGradient(startColor, endColor);
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full left-0 mt-1 z-50 rounded-lg p-3 shadow-xl border w-64"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Gradient Presets
        </p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => handlePresetClick(preset.start, preset.end)}
              className="h-7 rounded-md border border-transparent hover:border-white/30 transition-fast text-[10px] font-medium text-white/90"
              style={{
                background: `linear-gradient(to right, ${preset.start}, ${preset.end})`,
              }}
              title={preset.name}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <p className="text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Custom
        </p>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type="text"
            value={startColor}
            onChange={(e) => setStartColor(e.target.value)}
            className="input text-xs px-2 py-1 w-20 rounded-md"
            maxLength={7}
            placeholder="#ff0000"
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
          <input
            type="text"
            value={endColor}
            onChange={(e) => setEndColor(e.target.value)}
            className="input text-xs px-2 py-1 w-20 rounded-md"
            maxLength={7}
            placeholder="#ffcc00"
          />
        </div>
        <div
          className="h-4 rounded-md mb-2"
          style={{
            background: `linear-gradient(to right, ${startColor}, ${endColor})`,
          }}
        />
        <button
          type="button"
          onClick={handleCustomApply}
          className="w-full text-xs py-1.5 rounded-md bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 transition-fast"
        >
          Apply Gradient
        </button>
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Select text first, then apply gradient
        </p>
      </div>
    </>
  );
}

export function generateGradientMarkup(
  text: string,
  startHex: string,
  endHex: string
): string {
  if (!text) return '';
  const chars = [...text]; // handle unicode properly
  if (chars.length === 1) {
    return `<color=${startHex}>${text}</color>`;
  }

  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  if (!start || !end) return text;

  return chars
    .map((char, i) => {
      if (char === ' ') return ' ';
      const t = chars.length === 1 ? 0 : i / (chars.length - 1);
      const r = Math.round(start.r + (end.r - start.r) * t);
      const g = Math.round(start.g + (end.g - start.g) * t);
      const b = Math.round(start.b + (end.b - start.b) * t);
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      return `<color=${hex}>${char}</color>`;
    })
    .join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
