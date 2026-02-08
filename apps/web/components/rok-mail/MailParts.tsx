'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { RokMailPreview } from './RokMailPreview';

interface MailPartsProps {
  parts: string[];
}

export function MailParts({ parts }: MailPartsProps) {
  const [activePart, setActivePart] = useState(0);
  const [copiedPart, setCopiedPart] = useState<number | null>(null);

  async function copyPart(index: number) {
    try {
      await navigator.clipboard.writeText(parts[index]);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = parts[index];
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedPart(index);
    setTimeout(() => setCopiedPart(null), 2000);
  }

  return (
    <div
      className="rounded-lg border"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      {/* Header with part tabs */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          Split into {parts.length} parts
        </span>
        <div className="flex items-center gap-1">
          {parts.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActivePart(i)}
              className={`min-w-[28px] px-2 py-1 rounded-md text-xs font-medium transition-fast ${
                activePart === i
                  ? 'bg-pink-500/20 text-pink-400'
                  : 'hover:bg-pink-500/5'
              }`}
              style={activePart !== i ? { color: 'var(--text-secondary)' } : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {parts[activePart].length}/2000
        </span>
        <button
          type="button"
          onClick={() => copyPart(activePart)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-fast ${
            copiedPart === activePart
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30'
          }`}
        >
          {copiedPart === activePart ? <Check size={14} /> : <Copy size={14} />}
          {copiedPart === activePart ? 'Copied!' : `Copy Part ${activePart + 1}`}
        </button>
      </div>

      {/* Part preview */}
      <div style={{ minHeight: '200px' }}>
        <RokMailPreview content={parts[activePart]} />
      </div>
    </div>
  );
}
