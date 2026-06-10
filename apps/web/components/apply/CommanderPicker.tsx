'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { commanderReferences, type CommanderReference } from '@/lib/sunset-canyon/commander-reference';

interface CommanderPickerProps {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  /** Optional unit-type filter — matches against the commander's specialties. */
  unitFilter?: 'infantry' | 'archer' | 'cavalry' | null;
  /**
   * Garrison mode: list only garrison commanders (those with the 'Garrison'
   * specialty) and ignore unitFilter. RoK garrison commanders defend the city
   * regardless of troop type — many are leadership-type with no troop tag — so
   * the troop filter would wrongly hide them.
   */
  garrisonOnly?: boolean;
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

function isGarrisonCommander(c: CommanderReference): boolean {
  return c.specialties.some((s) => s.toLowerCase() === 'garrison');
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function CommanderPicker({
  value,
  onChange,
  unitFilter,
  garrisonOnly = false,
  placeholder,
  invalid = false,
}: CommanderPickerProps) {
  const t = useTranslations('apply.commander');
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
      if (garrisonOnly) {
        if (!isGarrisonCommander(c)) return false;
      } else if (!matchesUnit(c, unitFilter)) {
        return false;
      }
      if (!q) return true;
      const haystacks = [c.name, c.title, ...(c.altNames || [])].map(normalize);
      return haystacks.some((h) => h.includes(q));
    });
    return filtered;
  }, [sorted, search, unitFilter, garrisonOnly]);

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

  // Body scroll lock on mobile while picker is open (we render as a modal there).
  useEffect(() => {
    if (!open) return;
    const isSmall = window.matchMedia('(max-width: 639px)').matches;
    if (!isSmall) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
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

  const handleClose = () => {
    setOpen(false);
    setSearch('');
  };

  const borderClass = invalid
    ? 'border-red-500/60'
    : 'border-[var(--border)] hover:border-[var(--foreground)]/20';

  const triggerPlaceholder = placeholder ?? t('placeholder');

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-lg border bg-[var(--background-secondary)] text-left transition-colors ${borderClass}`}
      >
        {selected ? (
          <>
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
              className="p-2 -mr-1 rounded-md text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
              aria-label={t('clear')}
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-[var(--text-muted)]">{triggerPlaceholder}</span>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          </>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Picker panel — bottom sheet on mobile, popover on desktop */}
          <div
            className="
              fixed sm:absolute z-50
              left-0 right-0 bottom-0 sm:bottom-auto sm:top-auto sm:mt-1
              rounded-t-2xl sm:rounded-xl
              bg-[var(--background-card)] border border-[var(--border)] shadow-2xl
              max-h-[80vh] sm:max-h-96
              flex flex-col
            "
            role="dialog"
            aria-modal="true"
            aria-label={t('dialogLabel')}
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/40" />
            </div>

            {/* Header (mobile only): title + close */}
            <div className="sm:hidden flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--foreground)]">{t('dialogLabel')}</p>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 -mr-2 rounded-md text-[var(--text-muted)] hover:text-[var(--foreground)]"
                aria-label={t('close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative border-b border-[var(--border)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full pl-9 pr-3 py-3 sm:py-2.5 bg-transparent border-0 text-base sm:text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none"
                autoComplete="off"
              />
            </div>

            {/* Active filter indicator */}
            {(garrisonOnly || unitFilter) && (
              <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--background-secondary)]/60 border-b border-[var(--border)]">
                {t('filtered', { unit: garrisonOnly ? 'garrison' : unitFilter ?? '', count: visible.length })}
              </div>
            )}

            {/* List */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {visible.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                  {t('noResults')}
                </div>
              ) : (
                visible.map((c) => {
                  const isSelected = c.id === value;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handlePick(c)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--background-secondary)] transition-colors ${
                        isSelected ? 'bg-[#4318ff]/10' : ''
                      }`}
                    >
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

            {/* Safe-area padding for iOS home indicator */}
            <div className="sm:hidden h-[env(safe-area-inset-bottom)]" />
          </div>
        </>
      )}
    </div>
  );
}
