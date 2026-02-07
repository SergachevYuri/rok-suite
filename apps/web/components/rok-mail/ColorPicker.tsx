'use client';

import { useState } from 'react';
import { ROK_COLORS } from '@/lib/rok-mail/colors';

interface ColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

export function ColorPicker({ isOpen, onClose, onSelectColor }: ColorPickerProps) {
  const [customHex, setCustomHex] = useState('');

  if (!isOpen) return null;

  function handlePresetClick(colorName: string) {
    onSelectColor(colorName);
    onClose();
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customHex && /^#[0-9a-fA-F]{3,6}$/.test(customHex)) {
      onSelectColor(customHex);
      setCustomHex('');
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full left-0 mt-1 z-50 rounded-lg p-3 shadow-xl border"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Presets
        </p>
        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {ROK_COLORS.map((color) => (
            <button
              key={color.name}
              type="button"
              onClick={() => handlePresetClick(color.name)}
              className="w-7 h-7 rounded-md border-2 border-transparent hover:border-white/30 transition-fast hover:scale-110"
              style={{ backgroundColor: color.display }}
              title={color.name}
            />
          ))}
        </div>
        <p className="text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Custom Hex
        </p>
        <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            placeholder="#ff0000"
            className="input text-xs px-2 py-1 w-24 rounded-md"
            maxLength={7}
          />
          <button
            type="submit"
            className="text-xs px-2 py-1 rounded-md bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 transition-fast"
          >
            Apply
          </button>
        </form>
      </div>
    </>
  );
}
