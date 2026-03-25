'use client';

import { useState, useRef, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

// —— types ——————————————————————————————————————————————

interface BuffType {
  id: string;
  label: string;
  color: string;
  title: string;
  titleBonus: string;
  defaultRune: string;
}

// —— constants ——————————————————————————————————————————

const BUFF_TYPES: BuffType[] = [
  { id: 'training', label: 'Training', color: '#ff3333', title: 'Duke', titleBonus: '10%', defaultRune: '15' },
  { id: 'research', label: 'Research', color: '#3399ff', title: 'Scientist', titleBonus: '10%', defaultRune: '15' },
  { id: 'building', label: 'Building', color: '#33cc66', title: 'Justice', titleBonus: '10%', defaultRune: '15' },
  { id: 'gathering', label: 'Gathering', color: '#ffaa00', title: 'Treasurer', titleBonus: '10%', defaultRune: '15' },
  { id: 'healing', label: 'Healing', color: '#cc44cc', title: 'Architect', titleBonus: '10%', defaultRune: '15' },
];

const SIGN_OFF_OPTIONS = ['King Fluffy', 'Fluffy Queen'];

const KINGDOM_HEADER = `<size=26px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>⚔</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff3333>A</color><color=#ff6666>R</color><color=#ff9999>D</color><color=#ffcccc>S</color></size>`;

const DIVIDER = `►══════════════════════`;

// —— rich text preview parser —————————————————————————

function parseRichText(raw: string): string {
  let html = raw;
  html = html.replace(/<size=(\d+)px>([\s\S]*?)<\/size>/gi, '<span style="font-size:$1px">$2</span>');
  html = html.replace(/<color=(#[0-9a-fA-F]+)>([\s\S]*?)<\/color>/gi, '<span style="color:$1">$2</span>');
  html = html.replace(/<b>([\s\S]*?)<\/b>/gi, '<strong>$1</strong>');
  html = html.replace(/<i>([\s\S]*?)<\/i>/gi, '<em>$1</em>');
  return html;
}

function PreviewLine({ text }: { text: string }) {
  return <div dangerouslySetInnerHTML={{ __html: parseRichText(text) }} className="leading-relaxed" />;
}

// —— main component ——————————————————————————————————

export function KingdomBuffMail() {
  const [buffType, setBuffType] = useState('training');
  const [status, setStatus] = useState<'active' | 'scheduled'>('active');
  const [activationTime, setActivationTime] = useState('');
  const [runePercent, setRunePercent] = useState('15');
  const [runeX, setRuneX] = useState('');
  const [runeY, setRuneY] = useState('');
  const [includeTitle, setIncludeTitle] = useState(true);
  const [customTitle, setCustomTitle] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [signOff, setSignOff] = useState('King Fluffy');
  const [customSignOff, setCustomSignOff] = useState('');
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const buff = BUFF_TYPES.find(b => b.id === buffType)!;

  const buildMail = useCallback((): string => {
    const lines: string[] = [];

    lines.push(KINGDOM_HEADER);
    lines.push(DIVIDER);

    const buffLabel = `${buff.label} Buff ${status === 'active' ? 'Active' : 'Scheduled'}`;
    lines.push(`<b><color=${buff.color}>${buffLabel}</color></b>`);
    lines.push('');
    lines.push('Governors,');
    lines.push('');

    if (status === 'active') {
      lines.push(`Kingdom ${buff.label.toLowerCase()} buff is active now.`);
    } else if (activationTime) {
      lines.push(`Kingdom ${buff.label.toLowerCase()} buff will activate at ${activationTime} UTC.`);
    } else {
      lines.push(`Kingdom ${buff.label.toLowerCase()} buff will activate soon.`);
    }

    if (runePercent) {
      let runeLine = `${runePercent}% ${buff.label.toLowerCase()} rune`;
      if (runeX && runeY) runeLine += ` is at (${runeX}, ${runeY})`;
      runeLine += '.';
      lines.push(runeLine);
    }

    if (includeTitle) {
      const titleName = customTitle || buff.title;
      const parts: string[] = [];
      if (runePercent) parts.push(`${runePercent}% rune`);
      parts.push('10% KD buff');
      parts.push(`10% ${titleName}`);
      lines.push(`Apply for ${titleName} title. Stack everything: ${parts.join(' + ')}.`);
    }

    if (extraNote.trim()) {
      lines.push('');
      lines.push(extraNote.trim());
    }

    lines.push('');
    lines.push(DIVIDER);
    const sig = customSignOff || signOff;
    lines.push(`<b><color=#800000>⚔ ${sig}</color></b>`);

    return lines.join('\n');
  }, [buff, status, activationTime, runePercent, runeX, runeY, includeTitle, customTitle, extraNote, signOff, customSignOff]);

  const mail = buildMail();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mail);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = mail;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = 'w-full px-3 py-2 rounded-lg text-sm border bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-pink-500/50';

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="space-y-4">
          {/* Buff type */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Buff Type</label>
            <div className="flex flex-wrap gap-1.5">
              {BUFF_TYPES.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setBuffType(b.id); setCustomTitle(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    buffType === b.id ? 'opacity-100' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                  style={buffType === b.id ? { color: b.color, borderColor: b.color, backgroundColor: b.color + '15' } : undefined}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Status</label>
            <div className="flex gap-1.5">
              {(['active', 'scheduled'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    status === s ? '' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                  style={status === s ? { color: buff.color, borderColor: buff.color, backgroundColor: buff.color + '15' } : undefined}
                >
                  {s === 'active' ? 'Active Now' : 'Scheduled'}
                </button>
              ))}
            </div>
          </div>

          {/* Activation time */}
          {status === 'scheduled' && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Activation Time (UTC)</label>
              <input className={inputClass} placeholder="e.g. 14:00" value={activationTime} onChange={e => setActivationTime(e.target.value)} />
            </div>
          )}

          {/* Rune */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Rune</label>
            <div className="flex gap-2">
              <input className={`${inputClass} !w-20`} placeholder="%" value={runePercent} onChange={e => setRunePercent(e.target.value)} />
              <input className={`${inputClass} flex-1`} placeholder="X coord" value={runeX} onChange={e => setRuneX(e.target.value)} />
              <input className={`${inputClass} flex-1`} placeholder="Y coord" value={runeY} onChange={e => setRuneY(e.target.value)} />
            </div>
          </div>

          {/* Title stacking */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 cursor-pointer">
              <input type="checkbox" checked={includeTitle} onChange={e => setIncludeTitle(e.target.checked)} className="rounded accent-pink-500" />
              Include Title Stacking
            </label>
            {includeTitle && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap shrink-0">Default: {buff.title}</span>
                <input className={inputClass} placeholder="Override title name..." value={customTitle} onChange={e => setCustomTitle(e.target.value)} />
              </div>
            )}
          </div>

          {/* Extra note */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Extra Note (optional)</label>
            <textarea
              className={`${inputClass} min-h-[60px] resize-y`}
              placeholder="e.g. Tomorrow we will activate Training Buff"
              value={extraNote}
              onChange={e => setExtraNote(e.target.value)}
            />
          </div>

          {/* Sign-off */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Sign-off</label>
            <div className="flex gap-1.5 mb-2">
              {SIGN_OFF_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSignOff(s); setCustomSignOff(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    signOff === s && !customSignOff ? '' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`}
                  style={signOff === s && !customSignOff ? { color: buff.color, borderColor: buff.color, backgroundColor: buff.color + '15' } : undefined}
                >
                  {s}
                </button>
              ))}
            </div>
            <input className={inputClass} placeholder="Custom sign-off..." value={customSignOff} onChange={e => setCustomSignOff(e.target.value)} />
          </div>
        </div>

        {/* RIGHT: Preview + Raw */}
        <div className="space-y-4">
          {/* Visual preview */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Preview</label>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background-card)] p-4 text-sm leading-relaxed">
              {mail.split('\n').map((line, i) => (
                <PreviewLine key={i} text={line || '\u00A0'} />
              ))}
            </div>
          </div>

          {/* Raw output */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Raw (copy this)</label>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  copied
                    ? 'text-green-400 border-green-500/30 bg-green-500/10'
                    : 'text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)]'
                }`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre
              ref={outputRef}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words overflow-x-auto"
            >
              {mail}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
