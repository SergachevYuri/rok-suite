'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  secondary?: string;
}

/** Normalize text for fuzzy search: lowercase, strip diacritics, map superscript/subscript to ASCII */
function normalizeSearch(text: string): string {
  return text
    .normalize('NFKD')           // Decompose ligatures/superscripts to base chars
    .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritical marks
    .toLowerCase();
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string, label: string) => void;
  placeholder?: string;
  maxResults?: number;
  autoFocus?: boolean;
  /** Compact mode for tight layouts (smaller padding, text) */
  compact?: boolean;
  /** Show search icon */
  showSearchIcon?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  maxResults = 20,
  autoFocus = false,
  compact = false,
  showSearchIcon = true,
}: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, maxResults);
    const q = normalizeSearch(search);
    return options.filter((o) => normalizeSearch(o.label).includes(q)).slice(0, maxResults);
  }, [options, search, maxResults]);

  // Reset highlight when list changes
  useEffect(() => setHighlightIdx(0), [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = useCallback(
    (opt: SearchableOption) => {
      onChange(opt.value, opt.label);
      setSearch('');
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[highlightIdx]) select(filtered[highlightIdx]);
      } else if (e.key === 'Escape') {
        setSearch('');
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [filtered, highlightIdx, select],
  );

  const py = compact ? 'py-1' : 'py-1.5';
  const text = compact ? 'text-xs' : 'text-sm';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        {showSearchIcon && (
          <Search
            size={compact ? 12 : 14}
            className={`absolute ${compact ? 'left-2 top-2' : 'left-2.5 top-2.5'} pointer-events-none`}
            style={{ color: 'var(--text-muted)' }}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={open ? search : (search || selectedLabel)}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setSearch('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={value ? selectedLabel : placeholder}
          autoFocus={autoFocus}
          className={`w-full ${text} rounded-md ${compact ? 'px-2' : 'px-2'} ${py} border outline-none ${showSearchIcon ? (compact ? 'pl-7' : 'pl-8') : ''} pr-7`}
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
        {value && !open ? (
          <button
            type="button"
            onClick={() => {
              onChange('', '');
              setSearch('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={compact ? 10 : 12} />
          </button>
        ) : (
          <ChevronDown
            size={compact ? 10 : 12}
            className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border shadow-lg"
          style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(opt)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full text-left px-3 ${py} ${text} transition-colors flex justify-between items-center`}
              style={{
                backgroundColor: i === highlightIdx ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: 'var(--foreground)',
              }}
            >
              <span>{opt.label}</span>
              {opt.secondary && (
                <span className="text-[10px] ml-2 shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {opt.secondary}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && search && filtered.length === 0 && (
        <div
          className={`absolute z-50 mt-1 w-full rounded-md border shadow-lg px-3 ${py}`}
          style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <span className={text}>No matches</span>
        </div>
      )}
    </div>
  );
}
