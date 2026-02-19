'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Crown, Pencil, Trash2, Eye, EyeOff, ScrollText, Plus, Settings, FileText, Users, ClipboardList, Star } from 'lucide-react';
import { MgeApplyTab } from './MgeApplyTab';
import { MgeReviewTab } from './MgeReviewTab';
import { MgeEventSetup } from './MgeEventSetup';
import {
  updateMgeEvent,
  updateMgeEventStatus,
  updateEventCommanders,
  updateEventTiers,
  deleteMgeEvent,
  addSelection,
  removeSelection,
  type MgeEvent,
  type MgeSelection,
  type MgeEventStatus,
  RANKING_TIERS,
} from '@/lib/supabase/use-mge';
import { statusColor, statusLabel, tierSortValue } from '@/lib/mge/helpers';
import { allianceDisplay } from '@/lib/alliances';
import { supabase } from '@/lib/supabase';
import { Search, X } from 'lucide-react';

type EventTab = 'overview' | 'apply' | 'applications' | 'settings';

interface RosterMember {
  id: string;
  name: string;
  alliance: string | null;
  power: number;
}

interface MgeEventCardProps {
  event: MgeEvent;
  isAdmin: boolean;
  isOfficer: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRefetch: () => void;
  onGenerateMail: (evt: MgeEvent, type: 'applications' | 'rankings') => void;
  roster: RosterMember[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

export function MgeEventCard({
  event,
  isAdmin,
  isOfficer,
  isExpanded,
  onToggle,
  onRefetch,
  onGenerateMail,
  roster,
}: MgeEventCardProps) {
  const [activeTab, setActiveTab] = useState<EventTab>('overview');
  const [isEditing, setIsEditing] = useState(false);

  // Legacy add selection state
  const [isAddingSelection, setIsAddingSelection] = useState(false);
  const [selMemberSearch, setSelMemberSearch] = useState('');
  const [selMemberName, setSelMemberName] = useState('');
  const [selTier, setSelTier] = useState('1st Place');
  const [selPointsLimit, setSelPointsLimit] = useState('');
  const [selFreeForAll, setSelFreeForAll] = useState(false);

  const status = event.status || (event.is_published ? 'completed' : 'draft');
  const { bg: statusBg, text: statusText } = statusColor(status);
  const commanders = event.mge_event_commanders.length > 0
    ? event.mge_event_commanders.map(c => c.commander_name)
    : event.focused_commander.split(',').map(c => c.trim());
  const focusSet = new Set(
    event.mge_event_commanders.filter(c => c.is_focus).map(c => c.commander_name)
  );
  const isFocusCmd = (cmd: string, idx: number) =>
    focusSet.size > 0 ? focusSet.has(cmd) : idx === 0;
  const appCount = event.mge_applications?.length || 0;
  const pendingCount = event.mge_applications?.filter(a => a.status === 'pending').length || 0;

  const isOpen = status === 'open';
  const canApply = isOpen || status === 'reviewing';

  // Approved applications not yet finalized into selections
  const pendingAssignments = useMemo(() => {
    const approved = (event.mge_applications || []).filter(a => a.status === 'approved' && a.assigned_tier);
    const selNames = new Set(event.mge_selections.map(s => s.member_name.toLowerCase()));
    return approved
      .filter(a => !selNames.has(a.applicant_name.toLowerCase()))
      .sort((a, b) => tierSortValue(a.assigned_tier!) - tierSortValue(b.assigned_tier!));
  }, [event.mge_applications, event.mge_selections]);

  const handleDeleteEvent = async () => {
    if (!confirm('Delete this MGE event and all its data?')) return;
    const ok = await deleteMgeEvent(event.id);
    if (ok) onRefetch();
  };

  const handleStatusChange = async (newStatus: MgeEventStatus) => {
    const ok = await updateMgeEventStatus(event.id, newStatus);
    if (ok) onRefetch();
  };

  const handleSaveEdit = async (data: {
    date: string;
    commanders: { name: string; isFocus: boolean }[];
    tiers: { label: string; pointCap: number | null; isFfa: boolean; rewardHeads: number | null }[];
    notes: string;
    deadline: string;
  }) => {
    const focused = data.commanders.map(c => c.name).join(', ');
    await updateMgeEvent(event.id, {
      event_date: data.date,
      focused_commander: focused,
      notes: data.notes || null,
      application_deadline: data.deadline || null,
    });
    await updateEventCommanders(event.id, data.commanders);
    await updateEventTiers(event.id, data.tiers);
    setIsEditing(false);
    onRefetch();
  };

  const handleAddSelection = async () => {
    const memberName = selFreeForAll ? 'Free for All' : selMemberName.trim();
    if (!memberName) return;
    const pointsValue = selPointsLimit ? parseFloat(selPointsLimit) * 1_000_000 : null;
    const result = await addSelection(event.id, memberName, selTier, pointsValue, null);
    if (result) {
      const tierIdx = RANKING_TIERS.indexOf(selTier as typeof RANKING_TIERS[number]);
      const nextTier = tierIdx >= 0 && tierIdx < RANKING_TIERS.length - 1
        ? RANKING_TIERS[tierIdx + 1] : selTier;
      const nextPoints = selPointsLimit ? Math.max(0, parseFloat(selPointsLimit) - 1) : '';
      setSelMemberSearch('');
      setSelMemberName('');
      setSelTier(nextTier);
      setSelPointsLimit(nextPoints ? nextPoints.toString() : '');
      setSelFreeForAll(false);
      onRefetch();
    }
  };

  const handleRemoveSelection = async (id: number) => {
    if (!confirm('Remove this selection?')) return;
    const ok = await removeSelection(id);
    if (ok) onRefetch();
  };

  const startAddSelection = () => {
    const selections = event.mge_selections || [];
    let nextTier = '1st Place';
    let nextPoints = '';
    if (selections.length > 0) {
      const lastSel = selections[selections.length - 1];
      const lastTierIdx = RANKING_TIERS.indexOf(lastSel.ranking_tier as typeof RANKING_TIERS[number]);
      if (lastTierIdx >= 0 && lastTierIdx < RANKING_TIERS.length - 1) {
        nextTier = RANKING_TIERS[lastTierIdx + 1];
      }
      if (lastSel.power_cap) {
        const pts = lastSel.power_cap / 1_000_000 - 1;
        if (pts > 0) nextPoints = pts.toString();
      }
    }
    setIsAddingSelection(true);
    setSelMemberSearch('');
    setSelMemberName('');
    setSelTier(nextTier);
    setSelPointsLimit(nextPoints);
    setSelFreeForAll(false);
  };

  const filteredRoster = selMemberSearch
    ? roster.filter(m => m.name.toLowerCase().includes(selMemberSearch.toLowerCase())).slice(0, 15)
    : roster.slice(0, 15);

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  // Available tabs — officer sees Review & Rank, admin sees Settings, Apply pushed right
  const leftTabs: { key: EventTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: <FileText size={14} />, show: true },
    { key: 'applications', label: `Review & Rank${appCount > 0 ? ` (${appCount})` : ''}`, icon: <Users size={14} />, show: isOfficer },
    { key: 'settings', label: 'Settings', icon: <Settings size={14} />, show: isAdmin },
  ];
  const rightTabs: { key: EventTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'apply', label: 'Apply', icon: <ClipboardList size={14} />, show: canApply },
  ];

  return (
    <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
      {/* Event header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 text-left hover:bg-[var(--background-secondary)] transition-fast flex-wrap"
      >
        <Crown size={18} className="text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {commanders.map((cmd, i) => {
              const focus = isFocusCmd(cmd, i);
              return (
                <span
                  key={i}
                  className={`font-semibold px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
                    focus
                      ? 'text-base bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
                      : 'text-sm bg-zinc-500/10 text-zinc-500'
                  }`}
                >
                  {focus && <Star size={12} className="text-blue-400 fill-blue-400" />}
                  {cmd}
                </span>
              );
            })}
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {formatDate(event.event_date)}
            </span>
          </div>
        </div>
        <span className={`text-xs sm:text-sm px-2 sm:px-2.5 py-0.5 rounded-full ${statusBg} ${statusText} shrink-0`}>
          {statusLabel(status)}
        </span>
        {appCount > 0 && (
          <span className="hidden sm:inline-flex text-sm px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 shrink-0">
            {appCount} app{appCount !== 1 ? 's' : ''}
            {pendingCount > 0 && <span className="text-blue-400"> ({pendingCount} new)</span>}
          </span>
        )}
        <span className="hidden sm:inline-flex text-sm px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 shrink-0">
          {event.mge_selections.length + pendingAssignments.length} selected
        </span>
        {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> :
          <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Tab bar */}
          <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            {leftTabs.filter(t => t.show).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-fast border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent hover:bg-[var(--background-secondary)]'
                }`}
                style={activeTab !== tab.key ? { color: 'var(--text-muted)' } : undefined}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <div className="flex-1" />
            {rightTabs.filter(t => t.show).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-fast border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent hover:bg-[var(--background-secondary)]'
                }`}
                style={activeTab !== tab.key ? { color: 'var(--text-muted)' } : undefined}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <div>
              {/* Notes */}
              {event.notes && (
                <div className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {event.notes}
                </div>
              )}

              {/* Officer quick actions */}
              {isOfficer && (
                <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b flex-wrap" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={startAddSelection}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-blue-500/10 text-blue-400/70 hover:text-blue-400 transition-fast">
                    <Plus size={14} /> Add Member
                  </button>
                  <button onClick={() => onGenerateMail(event, 'applications')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-fast">
                    <ScrollText size={14} /> Mail: Applications
                  </button>
                  <button onClick={() => onGenerateMail(event, 'rankings')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-fast">
                    <ScrollText size={14} /> Mail: Rankings
                  </button>
                  <div className="flex-1" />
                  {/* Status transitions — admin only */}
                  {isAdmin && status === 'draft' && (
                    <button onClick={() => handleStatusChange('open')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-emerald-500/10 text-emerald-400/70 hover:text-emerald-400 transition-fast">
                      Open Applications
                    </button>
                  )}
                  {isAdmin && status === 'open' && (
                    <button onClick={() => handleStatusChange('reviewing')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-blue-500/10 text-blue-400/70 hover:text-blue-400 transition-fast">
                      Close & Review
                    </button>
                  )}
                  {isAdmin && status === 'finalized' && (
                    <button onClick={() => handleStatusChange('completed')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-zinc-500/10 text-zinc-400/70 hover:text-zinc-400 transition-fast">
                      Mark Complete
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={handleDeleteEvent}
                      className="p-1.5 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-fast" title="Delete event">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Add selection form */}
              {isAddingSelection && isOfficer && (
                <div className="px-4 py-3 border-b bg-blue-500/5" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                    {selFreeForAll ? (
                      <div className="md:col-span-2 flex items-center px-3 py-2 rounded-md text-sm italic"
                        style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}>
                        {selTier.replace(' Place', '')}+ — Free for all
                      </div>
                    ) : (
                      <div className="relative md:col-span-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            placeholder="Search member..."
                            value={selMemberName || selMemberSearch}
                            onChange={e => { setSelMemberSearch(e.target.value); setSelMemberName(''); }}
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
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-500/10 transition-fast flex justify-between">
                                <span style={{ color: 'var(--foreground)' }}>{m.name}</span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {m.alliance ? allianceDisplay(m.alliance) : ''} {formatPower(m.power)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <select value={selTier} onChange={e => setSelTier(e.target.value)}
                      className={inputClass} style={inputStyle}>
                      {RANKING_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="relative">
                      <input type="number" placeholder="Points (M)" value={selPointsLimit}
                        onChange={e => setSelPointsLimit(e.target.value)}
                        className={inputClass + ' w-full pr-8'} style={inputStyle} />
                      <span className="absolute right-3 top-2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>M</span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={selFreeForAll}
                        onChange={e => setSelFreeForAll(e.target.checked)} className="rounded" />
                      Free for All
                    </label>
                    <div className="flex-1" />
                    <button onClick={handleAddSelection}
                      disabled={!selFreeForAll && !selMemberName.trim()}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-fast disabled:opacity-40">
                      Add
                    </button>
                    <button onClick={() => setIsAddingSelection(false)}
                      className="px-3 py-2 rounded-md text-sm hover:bg-[var(--background-secondary)] transition-fast"
                      style={{ color: 'var(--text-secondary)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Selections list + pending assignments */}
              {event.mge_selections.length === 0 && pendingAssignments.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No members selected yet
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {event.mge_selections.map(sel => (
                    <div key={sel.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--background-secondary)] transition-fast">
                      <span className="text-sm font-semibold w-24 shrink-0 text-blue-400">
                        {sel.member_name === 'Free for All'
                          ? sel.ranking_tier.replace(' Place', '+')
                          : sel.ranking_tier}
                      </span>
                      <span className={`font-medium text-base flex-1 min-w-0 truncate ${sel.member_name === 'Free for All' ? 'italic' : ''}`}
                        style={{ color: sel.member_name === 'Free for All' ? 'var(--text-secondary)' : 'var(--foreground)' }}>
                        {sel.member_name === 'Free for All' ? 'Free for all' : sel.member_name}
                      </span>
                      {sel.power_cap && (
                        <span className="text-sm px-2.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}>
                          {formatPower(sel.power_cap)} pts
                        </span>
                      )}
                      {(() => {
                        const tier = event.mge_rank_tiers.find(t => t.tier_label === sel.ranking_tier);
                        return tier?.reward_heads ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 shrink-0">
                            {tier.reward_heads} GH
                          </span>
                        ) : null;
                      })()}
                      {sel.reason && (
                        <span className="text-sm hidden md:inline shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {sel.reason}
                        </span>
                      )}
                      {isOfficer && (
                        <button onClick={() => handleRemoveSelection(sel.id)}
                          className="p-1.5 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-fast">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pendingAssignments.length > 0 && (
                    <>
                      {event.mge_selections.length > 0 && (
                        <div className="px-4 py-1.5 text-xs font-medium"
                          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--background-secondary)' }}>
                          Assigned — Pending Finalization
                        </div>
                      )}
                      {pendingAssignments.map(app => (
                        <div key={`pending-${app.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--background-secondary)] transition-fast border-l-2 border-blue-500/30">
                          <span className="text-sm font-semibold w-24 shrink-0 text-blue-400/70">
                            {app.assigned_tier}
                          </span>
                          <span className="font-medium text-base flex-1 min-w-0 truncate"
                            style={{ color: 'var(--foreground)' }}>
                            {app.applicant_name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 shrink-0">
                            Assigned
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'apply' && canApply && (
            <MgeApplyTab event={event} onApplicationSubmitted={onRefetch} />
          )}

          {activeTab === 'applications' && isOfficer && (
            <MgeReviewTab event={event} isAdmin={isAdmin} onUpdate={onRefetch} />
          )}

          {activeTab === 'settings' && isAdmin && (
            <div className="p-4">
              {isEditing ? (
                <MgeEventSetup
                  onSave={handleSaveEdit}
                  onCancel={() => setIsEditing(false)}
                  initialData={{
                    date: event.event_date,
                    commanders: event.mge_event_commanders.length > 0
                      ? event.mge_event_commanders.map(c => ({ name: c.commander_name, isFocus: c.is_focus }))
                      : event.focused_commander.split(',').map((c, i) => ({ name: c.trim(), isFocus: i === 0 })),
                    tiers: event.mge_rank_tiers.map(t => ({ label: t.tier_label, pointCap: t.point_cap, isFfa: t.is_ffa, rewardHeads: t.reward_heads })),
                    notes: event.notes || '',
                    deadline: event.application_deadline || '',
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-fast"
                    >
                      <Pencil size={12} /> Edit Event
                    </button>
                  </div>

                  {/* Event details summary */}
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                      <span className={statusText}>{statusLabel(status)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Date:</span>
                      <span style={{ color: 'var(--foreground)' }}>{formatDate(event.event_date)}</span>
                    </div>
                    {event.application_deadline && (
                      <div className="flex gap-2">
                        <span style={{ color: 'var(--text-muted)' }}>Deadline:</span>
                        <span style={{ color: 'var(--foreground)' }}>{formatDate(event.application_deadline)}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Commanders:</span>
                      <span style={{ color: 'var(--foreground)' }}>{commanders.join(', ')}</span>
                    </div>
                    {event.mge_rank_tiers.length > 0 && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Tiers:</span>
                        <div className="mt-1 space-y-0.5">
                          {event.mge_rank_tiers.map(t => (
                            <div key={t.id} className="flex gap-2 text-xs">
                              <span className="w-20 text-blue-400">{t.tier_label}</span>
                              <span style={{ color: 'var(--foreground)' }}>
                                {t.point_cap ? `${formatPower(t.point_cap)} pts` : '—'}
                              </span>
                              {t.reward_heads != null && (
                                <span className="text-yellow-500">{t.reward_heads} GH</span>
                              )}
                              {t.is_ffa && <span className="text-zinc-500">FFA</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status transitions */}
                  <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Change Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['draft', 'open', 'reviewing', 'finalized', 'completed'] as MgeEventStatus[]).map(s => {
                        const { bg, text } = statusColor(s);
                        const isCurrent = s === status;
                        return (
                          <button
                            key={s}
                            onClick={() => !isCurrent && handleStatusChange(s)}
                            disabled={isCurrent}
                            className={`px-2.5 py-1 text-xs rounded-md transition-fast capitalize ${
                              isCurrent ? `${bg} ${text} ring-1 ring-current` : `${bg} ${text} opacity-60 hover:opacity-100`
                            }`}
                          >
                            {statusLabel(s)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
