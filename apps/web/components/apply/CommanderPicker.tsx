'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { commanderReferences, type CommanderReference } from '@/lib/sunset-canyon/commander-reference';

interface CommanderPickerProps {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  /** Optional unit-type filter — matches against the commander's specialties. */
  unitFilter?: 'infantry' | 'archer' | 'cavalry' | null;
  placeholder?: string;
  invalid?: boolean;
}

const RARITY_RANK: Record<CommanderReference['rarity'], number> = {
  legendary: 0,
  epic: 1,
  elite: 2,
  advanced: 3,
};

const RARITY_STYLES: Record<CommanderReference['rarity'], string> = {
  legendary: 'text-amber-400',
  epic: 'text-violet-400',
  elite: 'text-blue-400',
  advanced: 'text-emerald-400',
};

function matchesUnit(c: CommanderReference, unit: CommanderPickerProps['unitFilter']): boolean {
  if (!unit) return true;
  const target = unit.toLowerCase();
  return c.specialties.some((s) => s.toLowerCase() === target);
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function CommanderPicker({
  value,
  onChange,
  unitFilter,
  placeholder = 'Pick a commander…',
  invalid = false,
}: CommanderPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => commanderReferences.find((c) => c.id === value) || null,
    [value],
  );

  const sorted = useMemo(() => {
    return [...commanderReferences].sort((a, b) => {
      const rankDiff = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const visible = useMemo(() => {
    const q = normalize(search.trim());
    const filtered = sorted.filter((c) => {
      if (!matchesUnit(c, unitFilter)) return false;
      if (!q) return true;
      const haystacks = [c.name, c.title, ...(c.altNames || [])].map(normalize);
      return haystacks.some((h) => h.includes(q));
    });
    return filtered;
  }, [sorted, search, unitFilter]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  const handlePick = (c: CommanderReference) => {
    onChange(c.id, c.name);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
  };

  const borderClass = invalid
    ? 'border-red-500/60'
    : 'border-[var(--border)] hover:border-[var(--foreground)]/20';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border bg-[var(--background-secondary)] text-left transition-colors ${borderClass}`}
      >
        {selected ? (
          <>
            {selected.imageUrl ? (
              <img
                src={selected.imageUrl}
                alt=""
                className="w-9 h-9 rounded-md object-cover bg-[var(--background)] flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-[var(--background)] flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--foreground)] truncate">
                {selected.name}
              </p>
              <p className={`text-[10px] uppercase tracking-wider truncate ${RARITY_STYLES[selected.rarity]}`}>
                {selected.specialties.slice(0, 2).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-md bg-[var(--background)] flex-shrink-0" />
            <span className="flex-1 text-sm text-[var(--text-muted)]">{placeholder}</span>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-xl bg-[var(--background-card)] border border-[var(--border)] shadow-2xl overflow-hidden">
          <div className="relative border-b border-[var(--border)]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commanders…"
              className="w-full pl-9 pr-3 py-2.5 bg-transparent border-0 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                No commanders match.
              </div>
            ) : (
              visible.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => handlePick(c)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--background-secondary)] transition-colors ${
                      isSelected ? 'bg-[#4318ff]/10' : ''
                    }`}
                  >
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt=""
                        className="w-8 h-8 rounded-md object-cover bg-[var(--background-secondary)] flex-shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-[var(--background-secondary)] flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{c.name}</p>
                      <p className={`text-[10px] uppercase tracking-wider truncate ${RARITY_STYLES[c.rarity]}`}>
                        {c.specialties.join(' · ')}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
