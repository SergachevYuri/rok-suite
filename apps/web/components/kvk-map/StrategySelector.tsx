'use client';

import { useState, useRef, useEffect } from 'react';
import { Save, Trash2, Share2, ChevronDown, FolderOpen } from 'lucide-react';
import type { KvkStrategy } from '@/lib/kvk-map-types';

interface StrategySelectorProps {
  strategies: KvkStrategy[];
  activeStrategyId: string | null;
  onSelect: (strategyId: string | null) => void;
  onSave: (name: string) => void;
  onDelete: (strategyId: string) => void;
}

export default function StrategySelector({
  strategies,
  activeStrategyId,
  onSelect,
  onSave,
  onDelete,
}: StrategySelectorProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeStrategy = strategies.find((s) => s.id === activeStrategyId);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    setSaving(false);
    setOpen(false);
  };

  const handleShare = (strategy: KvkStrategy) => {
    if (!strategy.share_code) return;
    const url = `${window.location.origin}/kvk-map?strategy=${strategy.share_code}`;
    navigator.clipboard.writeText(url);
    alert('Strategy link copied to clipboard!');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        <FolderOpen size={13} />
        {activeStrategy ? activeStrategy.name : 'Live'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-64 rounded-lg border shadow-lg z-50 overflow-hidden"
          style={{
            backgroundColor: 'var(--background-card)',
            borderColor: 'var(--border)',
          }}
        >
          {/* Live option */}
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
            style={{
              backgroundColor: !activeStrategyId ? 'var(--background-hover)' : 'transparent',
              color: 'var(--foreground)',
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
            Live (current assignments)
          </button>

          {strategies.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {strategies.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-1 px-3 py-2 transition-colors"
                  style={{
                    backgroundColor: s.id === activeStrategyId ? 'var(--background-hover)' : 'transparent',
                  }}
                >
                  <button
                    onClick={() => { onSelect(s.id); setOpen(false); }}
                    className="flex-1 text-xs text-left truncate"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {s.name}
                  </button>
                  <button
                    onClick={() => handleShare(s)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Copy share link"
                  >
                    <Share2 size={11} />
                  </button>
                  <button
                    onClick={() => { onDelete(s.id); }}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Delete strategy"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save new */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {saving ? (
              <div className="flex items-center gap-1.5 p-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Strategy name..."
                  autoFocus
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: 'var(--foreground)' }}
                />
                <button
                  onClick={handleSave}
                  className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: '#4318ff', color: 'white' }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSaving(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Save size={12} />
                Save current as...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
