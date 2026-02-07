'use client';

import { useState, useEffect } from 'react';
import {
  ROK_SYMBOLS,
  SYMBOL_CATEGORY_LABELS,
  getRecentSymbols,
  addRecentSymbol,
  type SymbolCategory,
} from '@/lib/rok-mail/symbols';

interface SymbolPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
}

export function SymbolPicker({ isOpen, onClose, onSelectSymbol }: SymbolPickerProps) {
  const [activeCategory, setActiveCategory] = useState<SymbolCategory | 'recent'>('recent');
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRecentSymbols(getRecentSymbols());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleSymbolClick(symbol: string) {
    addRecentSymbol(symbol);
    setRecentSymbols(getRecentSymbols());
    onSelectSymbol(symbol);
  }

  const categories = Object.keys(ROK_SYMBOLS) as SymbolCategory[];
  const currentSymbols =
    activeCategory === 'recent'
      ? recentSymbols
      : ROK_SYMBOLS[activeCategory];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full left-0 mt-1 z-50 rounded-lg p-3 shadow-xl border w-80"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            type="button"
            onClick={() => setActiveCategory('recent')}
            className={`text-xs px-2 py-1 rounded-md transition-fast ${
              activeCategory === 'recent'
                ? 'bg-pink-500/20 text-pink-400'
                : 'hover:bg-pink-500/10'
            }`}
            style={activeCategory !== 'recent' ? { color: 'var(--text-secondary)' } : undefined}
          >
            Recent
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-2 py-1 rounded-md transition-fast ${
                activeCategory === cat
                  ? 'bg-pink-500/20 text-pink-400'
                  : 'hover:bg-pink-500/10'
              }`}
              style={activeCategory !== cat ? { color: 'var(--text-secondary)' } : undefined}
            >
              {SYMBOL_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-10 gap-1">
          {currentSymbols.length === 0 ? (
            <p className="col-span-10 text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
              {activeCategory === 'recent' ? 'No recent symbols' : 'No symbols'}
            </p>
          ) : (
            currentSymbols.map((symbol, i) => (
              <button
                key={`${symbol}-${i}`}
                type="button"
                onClick={() => handleSymbolClick(symbol)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-base hover:bg-pink-500/10 transition-fast"
              >
                {symbol}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
