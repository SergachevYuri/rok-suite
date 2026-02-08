'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { supabase } from '@/lib/supabase';
import {
  useMgeEvents,
  createMgeEvent,
  updateMgeEvent,
  deleteMgeEvent,
  addSelection,
  removeSelection,
  RANKING_TIERS,
  type MgeEvent,
  type MgeSelection,
} from '@/lib/supabase/use-mge';
import {
  Shield, Lock, Unlock, Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronUp, Search, Crown,
} from 'lucide-react';
import { commanderReferences } from '@/lib/sunset-canyon/commander-reference';

const EDITOR_PASSWORD = 'carn-dum';

// Commander names sorted alphabetically for the picker
const COMMANDER_NAMES = commanderReferences
  .filter(c => c.rarity === 'legendary')
  .map(c => c.name)
  .sort();

function CommanderPicker({
  value,
  onChange,
  inputClass,
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
  inputStyle: React.CSSProperties;
}) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const filtered = useMemo(() => {
    if (!search) return COMMANDER_NAMES.filter(n => !selected.includes(n)).slice(0, 12);
    const q = search.toLowerCase();
    return COMMANDER_NAMES.filter(n => n.toLowerCase().includes(q) && !selected.includes(n)).slice(0, 12);
  }, [search, selected]);

  const addCommander = (name: string) => {
    const next = [...selected, name].join(', ');
    onChange(next);
    setSearch('');
    setShowDropdown(false);
  };

  const removeCommander = (name: string) => {
    const next = selected.filter(n => n !== name).join(', ');
    onChange(next);
  };

  return (
    <div className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map(name => (
            <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300">
              {name}
              <button type="button" onClick={() => removeCommander(name)} className="hover:text-amber-100">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder={selected.length ? 'Add another commander...' : 'Search commanders...'}
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className={inputClass + ' w-full pl-8'}
          style={inputStyle}
        />
      </div>
      {/* Dropdown */}
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border shadow-lg"
          style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
          {filtered.map(name => (
            <button key={name} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => addCommander(name)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-amber-500/10 transition-fast"
              style={{ color: 'var(--foreground)' }}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface RosterMember {
  id: string;
  name: string;
  alliance: string | null;
  power: number;
}

export default function MgePage() {
  const { events, loading, error, refetch } = useMgeEvents();

  // Admin mode
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // New event form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newCommander, setNewCommander] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Editing event
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCommander, setEditCommander] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Adding selection
  const [addingToEventId, setAddingToEventId] = useState<number | null>(null);
  const [selMemberSearch, setSelMemberSearch] = useState('');
  const [selMemberName, setSelMemberName] = useState('');
  const [selTier, setSelTier] = useState('1st Place');
  const [selPointsLimit, setSelPointsLimit] = useState('');
  const [selReason, setSelReason] = useState('');

  // Roster for member search
  const [roster, setRoster] = useState<RosterMember[]>([]);

  // Expanded events
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(() => new Set());

  // Fetch roster for member autocomplete
  useEffect(() => {
    async function fetchRoster() {
      const { data } = await supabase
        .from('alliance_roster')
        .select('id, name, alliance, power')
        .eq('is_active', true)
        .order('power', { ascending: false });
      setRoster(data || []);
    }
    fetchRoster();
  }, []);

  // Auto-expand the newest event
  useEffect(() => {
    if (events.length > 0 && expandedEvents.size === 0) {
      setExpandedEvents(new Set([events[0].id]));
    }
  }, [events, expandedEvents.size]);

  const filteredRoster = useMemo(() => {
    if (!selMemberSearch) return roster.slice(0, 15);
    const search = selMemberSearch.toLowerCase();
    return roster.filter(m => m.name.toLowerCase().includes(search)).slice(0, 15);
  }, [roster, selMemberSearch]);

  const handleLogin = () => {
    if (password === EDITOR_PASSWORD) {
      setIsAdmin(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleCreateEvent = async () => {
    if (!newDate || !newCommander.trim()) return;
    setCreating(true);
    const result = await createMgeEvent(newDate, newCommander.trim(), newNotes.trim() || undefined);
    if (result) {
      setShowNewForm(false);
      setNewDate('');
      setNewCommander('');
      setNewNotes('');
      refetch();
    }
    setCreating(false);
  };

  const handleUpdateEvent = async (id: number) => {
    if (!editDate || !editCommander.trim()) return;
    const ok = await updateMgeEvent(id, {
      event_date: editDate,
      focused_commander: editCommander.trim(),
      notes: editNotes.trim() || null,
    });
    if (ok) {
      setEditingEventId(null);
      refetch();
    }
  };

  const handleDeleteEvent = async (id: number) => {
    if (!confirm('Delete this MGE event and all its selections?')) return;
    const ok = await deleteMgeEvent(id);
    if (ok) refetch();
  };

  const handleAddSelection = async (eventId: number) => {
    if (!selMemberName.trim()) return;
    const result = await addSelection(
      eventId,
      selMemberName.trim(),
      selTier,
      selPointsLimit ? parseInt(selPointsLimit) : null,
      selReason.trim() || null
    );
    if (result) {
      setAddingToEventId(null);
      setSelMemberSearch('');
      setSelMemberName('');
      setSelTier('1st Place');
      setSelPointsLimit('');
      setSelReason('');
      refetch();
    }
  };

  const handleRemoveSelection = async (id: number) => {
    if (!confirm('Remove this member from the event?')) return;
    const ok = await removeSelection(id);
    if (ok) refetch();
  };

  const toggleEvent = (id: number) => {
    const next = new Set(expandedEvents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedEvents(next);
  };

  const startEditEvent = (evt: MgeEvent) => {
    setEditingEventId(evt.id);
    setEditDate(evt.event_date);
    setEditCommander(evt.focused_commander);
    setEditNotes(evt.notes || '');
  };

  const startAddSelection = (eventId: number) => {
    setAddingToEventId(eventId);
    setSelMemberSearch('');
    setSelMemberName('');
    setSelTier('1st Place');
    setSelPointsLimit('');
    setSelReason('');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatPower = (power: number) => {
    if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
    if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
    return power.toString();
  };

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };
  const btnPrimary = 'px-4 py-2 rounded-md text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-fast';
  const btnDanger = 'p-1.5 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-fast';
  const btnMuted = 'px-3 py-2 rounded-md text-sm hover:bg-[var(--background-secondary)] transition-fast';

  return (
    <AppSidebar>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield size={28} className="text-amber-500" />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              MGE Events
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <button onClick={() => setShowNewForm(true)} className={btnPrimary}>
                  <span className="flex items-center gap-1.5"><Plus size={16} /> New Event</span>
                </button>
                <button
                  onClick={() => setIsAdmin(false)}
                  className="p-2 rounded-md hover:bg-amber-500/10 transition-fast"
                  title="Lock admin mode"
                >
                  <Unlock size={18} className="text-amber-400" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowPasswordPrompt(true)}
                className="p-2 rounded-md hover:bg-[var(--background-secondary)] transition-fast"
                style={{ color: 'var(--text-muted)' }}
                title="Admin mode"
              >
                <Lock size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Password prompt */}
        {showPasswordPrompt && (
          <div className="mb-4 p-4 rounded-lg border flex items-center gap-3"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
            <Lock size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className={inputClass + ' flex-1'}
              style={inputStyle}
              autoFocus
            />
            <button onClick={handleLogin} className={btnPrimary}>Enter</button>
            <button onClick={() => { setShowPasswordPrompt(false); setPassword(''); }}
              className="p-2 rounded-md hover:bg-[var(--background-secondary)]"
              style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* New event form */}
        {showNewForm && isAdmin && (
          <div className="mb-6 p-5 rounded-lg border"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              Create New MGE Event
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Event Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className={inputClass + ' w-full'} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Focused Commander(s)</label>
                <CommanderPicker value={newCommander} onChange={setNewCommander}
                  inputClass={inputClass} inputStyle={inputStyle} />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Notes (optional)</label>
              <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                placeholder="Any additional notes..."
                className={inputClass + ' w-full'} style={{ ...inputStyle, minHeight: '60px' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateEvent} disabled={creating || !newDate || !newCommander.trim()}
                className={btnPrimary + ' disabled:opacity-40'}>
                {creating ? 'Creating...' : 'Create Event'}
              </button>
              <button onClick={() => setShowNewForm(false)} className={btnMuted}
                style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading && (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            Loading events...
          </div>
        )}
        {error && (
          <div className="p-4 rounded-lg text-red-400 bg-red-500/10 border border-red-500/20 mb-4">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && events.length === 0 && (
          <div className="text-center py-16 rounded-lg border"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
            <Crown size={48} className="mx-auto mb-4 text-amber-500/30" />
            <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No MGE events yet
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAdmin ? 'Create your first event above.' : 'Events will appear here once created.'}
            </p>
          </div>
        )}

        {/* Event list */}
        <div className="space-y-4">
          {events.map(evt => {
            const isExpanded = expandedEvents.has(evt.id);
            const isEditing = editingEventId === evt.id;
            const isAddingHere = addingToEventId === evt.id;

            return (
              <div key={evt.id} className="rounded-lg border overflow-hidden"
                style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>

                {/* Event header */}
                <button
                  type="button"
                  onClick={() => toggleEvent(evt.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--background-secondary)] transition-fast"
                >
                  <Crown size={18} className="text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                            className={inputClass + ' w-36'} style={inputStyle} />
                          <div className="flex-1" />
                          <button onClick={() => handleUpdateEvent(evt.id)}
                            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10"><Check size={16} /></button>
                          <button onClick={() => setEditingEventId(null)}
                            className="p-1.5 rounded-md hover:bg-[var(--background-secondary)]"
                            style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
                        </div>
                        <CommanderPicker value={editCommander} onChange={setEditCommander}
                          inputClass={inputClass} inputStyle={inputStyle} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {evt.focused_commander.split(',').map((cmd, i) => (
                          <span key={i} className="font-semibold text-sm px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300">
                            {cmd.trim()}
                          </span>
                        ))}
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(evt.event_date)}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 shrink-0">
                    {evt.mge_selections.length} selected
                  </span>
                  {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> :
                    <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Notes */}
                    {isEditing ? (
                      <div className="px-4 py-2" onClick={e => e.stopPropagation()}>
                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          placeholder="Notes (optional)"
                          className={inputClass + ' w-full'} style={{ ...inputStyle, minHeight: '50px' }} />
                      </div>
                    ) : evt.notes ? (
                      <div className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {evt.notes}
                      </div>
                    ) : null}

                    {/* Admin actions */}
                    {isAdmin && !isEditing && (
                      <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                        <button onClick={() => startEditEvent(evt)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-amber-500/10 text-amber-400/70 hover:text-amber-400 transition-fast">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => startAddSelection(evt.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-amber-500/10 text-amber-400/70 hover:text-amber-400 transition-fast">
                          <Plus size={12} /> Add Member
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => handleDeleteEvent(evt.id)} className={btnDanger} title="Delete event">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}

                    {/* Add selection form */}
                    {isAddingHere && isAdmin && (
                      <div className="px-4 py-3 border-b bg-amber-500/5" style={{ borderColor: 'var(--border)' }}>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                          {/* Member search */}
                          <div className="relative md:col-span-2">
                            <div className="relative">
                              <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
                              <input
                                type="text"
                                placeholder="Search member..."
                                value={selMemberName || selMemberSearch}
                                onChange={e => {
                                  setSelMemberSearch(e.target.value);
                                  setSelMemberName('');
                                }}
                                className={inputClass + ' w-full pl-8'}
                                style={inputStyle}
                                autoFocus
                              />
                            </div>
                            {selMemberSearch && !selMemberName && (
                              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border shadow-lg"
                                style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
                                {filteredRoster.map(m => (
                                  <button key={m.id} type="button"
                                    onClick={() => { setSelMemberName(m.name); setSelMemberSearch(''); }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-amber-500/10 transition-fast flex justify-between">
                                    <span style={{ color: 'var(--foreground)' }}>{m.name}</span>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                      {m.alliance || ''} {formatPower(m.power)}
                                    </span>
                                  </button>
                                ))}
                                {filteredRoster.length === 0 && (
                                  <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No matches</div>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Tier */}
                          <select value={selTier} onChange={e => setSelTier(e.target.value)}
                            className={inputClass} style={inputStyle}>
                            {RANKING_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          {/* Points limit */}
                          <input type="number" placeholder="Points limit (opt.)" value={selPointsLimit}
                            onChange={e => setSelPointsLimit(e.target.value)}
                            className={inputClass} style={inputStyle} />
                        </div>
                        <div className="flex gap-2 items-center">
                          <input type="text" placeholder="Reason (optional)" value={selReason}
                            onChange={e => setSelReason(e.target.value)}
                            className={inputClass + ' flex-1'} style={inputStyle} />
                          <button onClick={() => handleAddSelection(evt.id)}
                            disabled={!selMemberName.trim()}
                            className={btnPrimary + ' disabled:opacity-40'}>Add</button>
                          <button onClick={() => setAddingToEventId(null)} className={btnMuted}
                            style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Selections list */}
                    {evt.mge_selections.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No members selected yet
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {evt.mge_selections.map(sel => (
                          <div key={sel.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--background-secondary)] transition-fast">
                            <span className="text-xs font-semibold w-20 shrink-0 text-amber-400">
                              {sel.ranking_tier}
                            </span>
                            <span className="font-medium text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)' }}>
                              {sel.member_name}
                            </span>
                            {sel.power_cap && (
                              <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                                style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}>
                                {formatPower(sel.power_cap)} pts
                              </span>
                            )}
                            {sel.reason && (
                              <span className="text-xs hidden md:inline shrink-0" style={{ color: 'var(--text-muted)' }}>
                                {sel.reason}
                              </span>
                            )}
                            {isAdmin && (
                              <button onClick={() => handleRemoveSelection(sel.id)} className={btnDanger}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppSidebar>
  );
}
