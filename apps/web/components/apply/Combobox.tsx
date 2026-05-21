'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ComboboxSuggestion {
  /** Stable key */
  key: string;
  /** Value written into the input when picked */
  label: string;
  /** Optional muted right-side text shown in dropdown rows */
  secondary?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user picks from the suggestions list. */
  onPick?: (suggestion: ComboboxSuggestion) => void;
  suggestions: ComboboxSuggestion[];
  placeholder?: string;
  invalid?: boolean;
  inputMode?: 'text' | 'numeric';
  maxResults?: number;
  emptyHint?: string;
  /** Show a loading state instead of suggestions/empty hint */
  loading?: boolean;
  loadingHint?: string;
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * A combobox: an editable text input with an attached suggestion dropdown.
 * Users can either pick a suggestion (firing onPick) or type any free text
 * (onChange fires on every keystroke).
 */
export function Combobox({
  value,
  onChange,
  onPick,
  suggestions,
  placeholder,
  invalid = false,
  inputMode = 'text',
  maxResults = 20,
  emptyHint,
  loading = false,
  loadingHint,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(value.trim());
    if (!q) return suggestions.slice(0, maxResults);
    return suggestions
      .filter((s) => normalize(s.label).includes(q) || (s.secondary && normalize(s.secondary).includes(q)))
      .slice(0, maxResults);
  }, [suggestions, value, maxResults]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [value, open]);

  const handlePick = (s: ComboboxSuggestion) => {
    onChange(s.label);
    onPick?.(s);
    setOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && filtered[highlightIdx]) {
      e.preventDefault();
      handlePick(filtered[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const inputBase =
    'w-full rounded-lg border px-3 py-2.5 pr-9 text-base sm:text-sm outline-none transition-colors focus:ring-2 focus:ring-[#4318ff]/40';
  const borderClass = invalid
    ? 'border-red-500/60'
    : 'border-[var(--border)]';

  const hasContent = filtered.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        inputMode={inputMode}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={`${inputBase} ${borderClass}`}
        style={{
          backgroundColor: 'var(--background-secondary)',
          color: 'var(--foreground)',
        }}
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
          inputRef.current?.focus();
        }}
        className="absolute right-0 top-0 bottom-0 px-3 flex items-center text-[var(--text-muted)] hover:text-[var(--foreground)]"
        aria-label="Open suggestions"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (loading || hasContent || emptyHint) && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              {loadingHint ?? '…'}
            </div>
          ) : hasContent ? (
            filtered.map((s, idx) => (
              <button
                type="button"
                key={s.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handlePick(s);
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                  idx === highlightIdx
                    ? 'bg-[var(--background-secondary)]'
                    : 'hover:bg-[var(--background-secondary)]'
                }`}
              >
                <span className="text-sm text-[var(--foreground)] truncate">{s.label}</span>
                {s.secondary && (
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{s.secondary}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">{emptyHint}</div>
          )}
        </div>
      )}
    </div>
  );
}
