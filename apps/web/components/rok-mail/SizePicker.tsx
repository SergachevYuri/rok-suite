'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

const PRESET_SIZES = [20, 25, 30, 35, 40, 45, 50];
const STEP = 5;
const MIN_SIZE = 10;
const MAX_SIZE = 80;

interface SizePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSize: (size: string) => void;
}

export function SizePicker({ isOpen, onClose, onSelectSize }: SizePickerProps) {
  const [customValue, setCustomValue] = useState('');

  if (!isOpen) return null;

  function applySize(px: number) {
    onSelectSize(`${px}px`);
  }

  function handleStep(direction: 1 | -1) {
    // Step through sizes by STEP increments
    const current = customValue ? parseInt(customValue, 10) : 30;
    const next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, current + direction * STEP));
    setCustomValue(String(next));
    applySize(next);
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseInt(customValue, 10);
    if (val >= MIN_SIZE && val <= MAX_SIZE) {
      applySize(val);
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
          Font Size (px)
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="p-1.5 rounded-md border transition-fast hover:bg-pink-500/10 hover:border-pink-500/30"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Minus size={14} />
          </button>
          <div className="flex gap-1">
            {PRESET_SIZES.map((px) => (
              <button
                key={px}
                type="button"
                onClick={() => { setCustomValue(String(px)); applySize(px); onClose(); }}
                className="min-w-[32px] px-1.5 py-1.5 rounded-md border text-xs font-medium text-center transition-fast hover:bg-pink-500/10 hover:border-pink-500/30"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {px}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleStep(1)}
            className="p-1.5 rounded-md border transition-fast hover:bg-pink-500/10 hover:border-pink-500/30"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Plus size={14} />
          </button>
        </div>
        <form onSubmit={handleCustomSubmit} className="flex gap-1.5 mt-2">
          <input
            type="number"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Custom"
            className="input text-xs px-2 py-1 w-20 rounded-md"
            min={MIN_SIZE}
            max={MAX_SIZE}
          />
          <span className="text-xs self-center" style={{ color: 'var(--text-muted)' }}>px</span>
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
