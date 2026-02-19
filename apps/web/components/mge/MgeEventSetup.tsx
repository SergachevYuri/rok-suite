'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, X, Star, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { commanderReferences } from '@/lib/sunset-canyon/commander-reference';
import { generateDefaultTiers } from '@/lib/mge/helpers';
import { Search } from 'lucide-react';

const COMMANDER_NAMES = commanderReferences
  .filter(c => c.rarity === 'legendary')
  .map(c => c.name)
  .sort();

interface TierConfig {
  label: string;
  pointCap: number | null;
  isFfa: boolean;
  rewardHeads: number | null;
}

interface CommanderConfig {
  name: string;
  isFocus: boolean;
}

interface MgeEventSetupProps {
  onSave: (data: {
    date: string;
    commanders: CommanderConfig[];
    tiers: TierConfig[];
    notes: string;
    deadline: string;
  }) => Promise<void>;
  onCancel: () => void;
  initialData?: {
    date: string;
    commanders: CommanderConfig[];
    tiers: TierConfig[];
    notes: string;
    deadline: string;
  };
}

// Ensure initialData tiers have rewardHeads (backward compat)
function normalizeTiers(tiers: Partial<TierConfig>[]): TierConfig[] {
  return tiers.map(t => ({
    label: t.label || '',
    pointCap: t.pointCap ?? null,
    isFfa: t.isFfa ?? false,
    rewardHeads: t.rewardHeads ?? null,
  }));
}

export function MgeEventSetup({ onSave, onCancel, initialData }: MgeEventSetupProps) {
  const [date, setDate] = useState(initialData?.date || '');
  const [commanders, setCommanders] = useState<CommanderConfig[]>(initialData?.commanders || []);
  const [tiers, setTiers] = useState<TierConfig[]>(initialData?.tiers ? normalizeTiers(initialData.tiers) : []);
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [deadline, setDeadline] = useState(initialData?.deadline || '');
  const [saving, setSaving] = useState(false);

  // Commander search
  const [cmdSearch, setCmdSearch] = useState('');
  const [showCmdDropdown, setShowCmdDropdown] = useState(false);

  // Section collapse
  const [showTiers, setShowTiers] = useState(true);

  const selectedNames = commanders.map(c => c.name);

  const filteredCommanders = useMemo(() => {
    const available = COMMANDER_NAMES.filter(n => !selectedNames.includes(n));
    if (!cmdSearch) return available.slice(0, 12);
    const q = cmdSearch.toLowerCase();
    return available.filter(n => n.toLowerCase().includes(q)).slice(0, 12);
  }, [cmdSearch, selectedNames]);

  const addCommander = (name: string) => {
    const isFocus = commanders.length === 0;
    setCommanders([...commanders, { name, isFocus }]);
    setCmdSearch('');
    setShowCmdDropdown(false);
  };

  const removeCommander = (name: string) => {
    const filtered = commanders.filter(c => c.name !== name);
    // If we removed the focus commander, make the first one focus
    if (filtered.length > 0 && !filtered.some(c => c.isFocus)) {
      filtered[0].isFocus = true;
    }
    setCommanders(filtered);
  };

  const toggleFocus = (name: string) => {
    setCommanders(commanders.map(c => ({
      ...c,
      isFocus: c.name === name,
    })));
  };

  const addTier = () => {
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
    const idx = tiers.length;
    setTiers([...tiers, {
      label: `${ordinals[idx] || `${idx + 1}th`} Place`,
      pointCap: null,
      isFfa: false,
      rewardHeads: null,
    }]);
  };

  const removeTier = (idx: number) => {
    setTiers(tiers.filter((_, i) => i !== idx));
  };

  const updateTier = (idx: number, updates: Partial<TierConfig>) => {
    setTiers(tiers.map((t, i) => i === idx ? { ...t, ...updates } : t));
  };

  const autoFillTiers = (count: number) => {
    setTiers(generateDefaultTiers(count));
  };

  const handleSave = async () => {
    if (!date || commanders.length === 0) return;
    setSaving(true);
    try {
      await onSave({ date, commanders, tiers, notes, deadline });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  return (
    <div className="p-5 rounded-lg border mb-6" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
        {initialData ? 'Edit Event' : 'Create New MGE Event'}
      </h2>

      {/* Commanders */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Commanders
        </label>
        {commanders.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {commanders.map(c => (
              <span key={c.name}
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${
                  c.isFocus ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-[var(--background-secondary)] border border-transparent'
                }`}
                style={!c.isFocus ? { color: 'var(--foreground)' } : undefined}
              >
                {c.isFocus && <Star size={10} className="text-blue-400 fill-blue-400" />}
                {c.name}
                {!c.isFocus && commanders.length > 1 && (
                  <button type="button" onClick={() => toggleFocus(c.name)}
                    className="hover:text-blue-400 transition-fast" title="Set as focus">
                    <Star size={10} />
                  </button>
                )}
                <button type="button" onClick={() => removeCommander(c.name)}
                  className="hover:text-red-400 transition-fast">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={commanders.length ? 'Add another commander...' : 'Search commanders...'}
            value={cmdSearch}
            onChange={e => { setCmdSearch(e.target.value); setShowCmdDropdown(true); }}
            onFocus={() => setShowCmdDropdown(true)}
            onBlur={() => setTimeout(() => setShowCmdDropdown(false), 200)}
            className={inputClass + ' w-full pl-8'}
            style={inputStyle}
          />
          {showCmdDropdown && filteredCommanders.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border shadow-lg"
              style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
              {filteredCommanders.map(name => (
                <button key={name} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addCommander(name)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-500/10 transition-fast"
                  style={{ color: 'var(--foreground)' }}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        {commanders.length > 1 && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            <Star size={8} className="inline text-blue-400 fill-blue-400" /> marks the focus commander (the one players submit stats for)
          </p>
        )}
      </div>

      {/* Date and Deadline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Event Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className={inputClass + ' w-full'} style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Application Deadline</label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className={inputClass + ' w-full'} style={inputStyle}
            title="After this date, new applications are blocked" />
        </div>
      </div>

      {/* Rank Tiers */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowTiers(!showTiers)}
          className="flex items-center gap-2 text-xs font-medium mb-2 hover:opacity-80 transition-fast"
          style={{ color: 'var(--text-secondary)' }}
        >
          {showTiers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Rank Tiers ({tiers.length})
        </button>

        {showTiers && (
          <>
            {tiers.length > 0 && (
              <div className="mb-2">
                {/* Column headers */}
                <div className="flex items-center gap-2 mb-1 px-0.5">
                  <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>Rank</span>
                  <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>Points (M)</span>
                  <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>Gold Heads</span>
                  <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-muted)' }}>FFA</span>
                </div>
                <div className="space-y-1">
                  {tiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs w-20 shrink-0 text-blue-400 font-medium">{tier.label}</span>
                      <div className="relative w-24 shrink-0">
                        <input
                          type="number"
                          placeholder="—"
                          value={tier.pointCap !== null ? tier.pointCap / 1_000_000 : ''}
                          onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) * 1_000_000 : null;
                            updateTier(i, { pointCap: val });
                          }}
                          className={inputClass + ' w-full pr-7'}
                          style={inputStyle}
                          title="Max points this rank can score (in millions)"
                        />
                        <span className="absolute right-2 top-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>M</span>
                      </div>
                      <div className="relative w-20 shrink-0">
                        <input
                          type="number"
                          placeholder="—"
                          value={tier.rewardHeads ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            updateTier(i, { rewardHeads: val });
                          }}
                          className={inputClass + ' w-full'}
                          style={inputStyle}
                          title="Gold head reward for this rank"
                        />
                      </div>
                      <label className="flex items-center justify-center w-10 shrink-0 cursor-pointer"
                        title="Free for all — no assigned player, anyone can compete">
                        <input type="checkbox" checked={tier.isFfa}
                          onChange={e => updateTier(i, { isFfa: e.target.checked })}
                          className="rounded" />
                      </label>
                      <button type="button" onClick={() => removeTier(i)}
                        className="p-1 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-fast"
                        title="Remove tier">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={addTier}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md hover:bg-blue-500/10 text-blue-400/70 hover:text-blue-400 transition-fast">
                <Plus size={12} /> Add Tier
              </button>
              <button type="button" onClick={() => autoFillTiers(5)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md hover:bg-purple-500/10 text-purple-400/70 hover:text-purple-400 transition-fast"
                title="Auto-fill 5 ranks with default point caps and gold head rewards">
                <Wand2 size={12} /> 5 Ranks
              </button>
              <button type="button" onClick={() => autoFillTiers(10)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md hover:bg-purple-500/10 text-purple-400/70 hover:text-purple-400 transition-fast"
                title="Auto-fill 10 ranks with default point caps and gold head rewards">
                <Wand2 size={12} /> 10 Ranks
              </button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Points = max score for that rank. Gold Heads = reward. FFA = open to everyone (no assigned player). Use presets to auto-fill defaults.
            </p>
          </>
        )}
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g., Infantry MGE — Submit your Charles Martel stats"
          className={inputClass + ' w-full'}
          style={{ ...inputStyle, minHeight: '60px' }}
        />
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Shown to applicants and included in mail templates
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !date || commanders.length === 0}
          className="px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-fast disabled:opacity-40"
        >
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Create Event'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-2 rounded-md text-sm hover:bg-[var(--background-secondary)] transition-fast"
          style={{ color: 'var(--text-secondary)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
