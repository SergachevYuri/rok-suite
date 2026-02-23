'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { supabase } from '@/lib/supabase';
import {
  useMgeEvents,
  createMgeEventFull,
  type MgeEvent,
} from '@/lib/supabase/use-mge';
import { Shield, Lock, Unlock, Plus, Crown, X } from 'lucide-react';
import { MgeEventCard } from '@/components/mge/MgeEventCard';
import { MgeEventSetup } from '@/components/mge/MgeEventSetup';
import { tierSortValue } from '@/lib/mge/helpers';

import { ADMIN_PASSWORD, OFFICER_PASSWORD } from '@/lib/auth-passwords';

interface RosterMember {
  id: string;
  name: string;
  alliance: string | null;
  power: number;
}

const KINGDOM_HEADER = `<size=30px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>—</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>`;
const KINGDOM_DIVIDER = '►═════════❂❂❂═════════◄';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function formatPointsCap(points: number): string {
  return points.toLocaleString('en-US');
}

function generateApplicationsMail(evt: MgeEvent): string {
  const commanders = evt.mge_event_commanders.length > 0
    ? evt.mge_event_commanders.map(c => c.commander_name)
    : evt.focused_commander.split(',').map(c => c.trim());
  const focusCommander = evt.mge_event_commanders.find(c => c.is_focus)?.commander_name
    || commanders[0] || '';

  const lines: string[] = [];
  lines.push(KINGDOM_HEADER);
  lines.push(KINGDOM_DIVIDER);
  lines.push('');
  lines.push(`<b><color=#ff3333>MGE — APPLICATIONS OPEN</color></b>`);
  lines.push('');
  lines.push(`<b>Commander:</b> ${commanders.join(', ')}`);
  lines.push(`<b>Date:</b> ${formatDate(evt.event_date)}`);
  if (evt.application_deadline) {
    lines.push(`<b>Deadline:</b> ${formatDate(evt.application_deadline)}`);
  }
  lines.push('');
  if (evt.notes) {
    lines.push(evt.notes);
    lines.push('');
  }

  if (evt.mge_rank_tiers.length > 0) {
    lines.push('<b>Available Ranks:</b>');
    for (const tier of evt.mge_rank_tiers) {
      const cap = tier.point_cap ? ` — ${formatPointsCap(tier.point_cap)} points` : '';
      const ffa = tier.is_ffa ? ' (free for all)' : '';
      lines.push(`${tier.tier_label}${cap}${ffa}`);
    }
    lines.push('');
  }

  lines.push(`If you want to compete for a ranking spot, submit your <b>${focusCommander}</b> stats at:`);
  lines.push(`<b>https://rok-suite.vercel.app/mge</b>`);
  lines.push('');
  lines.push(KINGDOM_DIVIDER);
  lines.push(`<b><color=#800000>— King Fluffy</color></b>`);

  return lines.join('\n');
}

function generateRankingsMail(evt: MgeEvent): string {
  // Build a unified rankings list from finalized selections + approved pending assignments
  const tierCapMap = new Map(evt.mge_rank_tiers.map(t => [t.tier_label, t.point_cap]));

  interface RankEntry { tier: string; name: string; pointCap: number | null; isFfa: boolean; sortVal: number }
  const entries: RankEntry[] = [];

  // Finalized selections
  for (const sel of evt.mge_selections) {
    const isFfa = sel.member_name === 'Free for All';
    entries.push({
      tier: sel.ranking_tier,
      name: isFfa ? 'Free for all' : sel.member_name,
      pointCap: sel.power_cap || tierCapMap.get(sel.ranking_tier) || null,
      isFfa,
      sortVal: sel.sort_order,
    });
  }

  // Approved applications with assigned tiers (not yet finalized)
  const selNames = new Set(evt.mge_selections.map(s => s.member_name.toLowerCase()));
  for (const app of evt.mge_applications || []) {
    if (app.status === 'approved' && app.assigned_tier && !selNames.has(app.applicant_name.toLowerCase())) {
      entries.push({
        tier: app.assigned_tier,
        name: app.applicant_name,
        pointCap: tierCapMap.get(app.assigned_tier) || null,
        isFfa: false,
        sortVal: tierSortValue(app.assigned_tier),
      });
    }
  }

  // Sort by tier order
  entries.sort((a, b) => a.sortVal - b.sortVal);

  // Also include FFA tiers that have no one assigned (just show the cap)
  const usedTiers = new Set(entries.map(e => e.tier));
  for (const tier of evt.mge_rank_tiers) {
    if (tier.is_ffa && !usedTiers.has(tier.tier_label)) {
      entries.push({
        tier: tier.tier_label,
        name: 'Free for all',
        pointCap: tier.point_cap,
        isFfa: true,
        sortVal: tier.sort_order,
      });
    }
  }
  entries.sort((a, b) => a.sortVal - b.sortVal);

  const lines: string[] = [];
  lines.push(KINGDOM_HEADER);
  lines.push(KINGDOM_DIVIDER);
  lines.push('');
  lines.push(`<b><color=#ff3333>MGE RANKINGS UPDATE</color></b>`);
  lines.push('');

  const commanders = evt.mge_event_commanders.length > 0
    ? evt.mge_event_commanders.map(c => c.commander_name)
    : evt.focused_commander.split(',').map(c => c.trim());
  lines.push(`<b>Commander:</b> ${commanders.join(', ')}`);
  lines.push('');

  if (evt.notes) {
    lines.push(evt.notes);
    lines.push('');
  }

  let lowestCap = 0;
  for (const entry of entries) {
    const tier = entry.isFfa ? entry.tier.replace(' Place', '+') : `<b>${entry.tier}</b>`;
    const pts = entry.pointCap ? ` - <b>${formatPointsCap(entry.pointCap)}</b> points${entry.isFfa ? ' max' : ''}` : '';
    lines.push(`${tier} - ${entry.name}${pts}`);
    if (entry.pointCap && (lowestCap === 0 || entry.pointCap < lowestCap)) {
      lowestCap = entry.pointCap;
    }
  }

  lines.push('');
  if (lowestCap > 0) {
    lines.push(`<b>Do not exceed your limit. If you're not on this list, stay under ${formatPointsCap(lowestCap)} to avoid unpleasant consequences</b>`);
    lines.push('');
  }
  lines.push(KINGDOM_DIVIDER);
  lines.push(`<b><color=#800000>— King Fluffy</color></b>`);

  return lines.join('\n');
}

type StatusFilter = 'all' | 'active' | 'past';

export default function MgePage() {
  const { events, loading, error, refetch } = useMgeEvents();

  // Two-level auth
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOfficer, setIsOfficer] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  // New event form
  const [showNewForm, setShowNewForm] = useState(false);

  // Expanded events
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(() => new Set());

  // Status filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // Roster for member autocomplete (shared across cards)
  const [roster, setRoster] = useState<RosterMember[]>([]);

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

  // Filter events
  const visibleEvents = useMemo(() => {
    let filtered = isAdmin ? events : events.filter(e => e.is_published || e.status === 'open' || e.status === 'reviewing');

    if (statusFilter === 'active') {
      filtered = filtered.filter(e => ['draft', 'open', 'reviewing', 'finalized'].includes(e.status || ''));
    } else if (statusFilter === 'past') {
      filtered = filtered.filter(e => e.status === 'completed');
    }

    return filtered;
  }, [events, isAdmin, statusFilter]);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else if (password === OFFICER_PASSWORD) {
      setIsOfficer(true);
      setShowPasswordPrompt(false);
      setPassword('');
    } else {
      alert('Incorrect password');
      setPassword('');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setIsOfficer(false);
  };

  const handleCreateEvent = async (data: {
    date: string;
    commanders: { name: string; isFocus: boolean }[];
    tiers: { label: string; pointCap: number | null; isFfa: boolean; rewardHeads?: number | null }[];
    notes: string;
    deadline: string;
  }) => {
    const result = await createMgeEventFull(
      data.date,
      data.commanders,
      data.tiers,
      data.notes || undefined,
      data.deadline || undefined,
    );
    if (result) {
      setShowNewForm(false);
      refetch();
    }
  };

  const handleGenerateMail = (evt: MgeEvent, type: 'applications' | 'rankings') => {
    const content = type === 'applications' ? generateApplicationsMail(evt) : generateRankingsMail(evt);
    localStorage.setItem('rok-mail-draft', content);
    window.location.href = '/rok-mail';
  };

  const toggleEvent = (id: number) => {
    const next = new Set(expandedEvents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedEvents(next);
  };

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };
  const btnPrimary = 'px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-fast';

  return (
    <AppSidebar>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield size={28} className="text-blue-500" />
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
                  onClick={handleLogout}
                  className="p-2 rounded-md hover:bg-blue-500/10 transition-fast"
                  title="Lock admin mode"
                >
                  <Unlock size={18} className="text-blue-400" />
                </button>
              </>
            ) : isOfficer ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-blue-500/10 transition-fast text-blue-400"
              >
                Officer Mode
                <X size={14} />
              </button>
            ) : (
              <button
                onClick={() => setShowPasswordPrompt(true)}
                className="p-2 rounded-md hover:bg-[var(--background-secondary)] transition-fast"
                style={{ color: 'var(--text-muted)' }}
                title="Login"
              >
                <Lock size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Mode banner */}
        {isOfficer && (
          <div className="mb-4 px-4 py-2 rounded-lg border flex items-center gap-2 text-sm bg-blue-500/10 border-blue-500/30">
            <span className="font-medium text-blue-400">{isAdmin ? 'Admin Mode' : 'Officer Mode'}</span>
            <span style={{ color: 'var(--text-muted)' }}>—</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isAdmin ? 'Full access: create events, review, manage' : 'Review and triage applicants'}
            </span>
          </div>
        )}

        {/* Password prompt */}
        {showPasswordPrompt && (
          <div className="mb-4 p-4 rounded-lg border flex items-center gap-3"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
            <Lock size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="password"
              placeholder="Password"
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

        {/* Status filter pills */}
        <div className="flex gap-1.5 mb-4">
          {([
            { key: 'active', label: 'Active' },
            { key: 'past', label: 'Past' },
            { key: 'all', label: 'All' },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-fast ${
                statusFilter === key ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-[var(--background-secondary)]'
              }`}
              style={statusFilter !== key ? { color: 'var(--text-muted)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {/* New event form */}
        {showNewForm && isAdmin && (
          <MgeEventSetup
            onSave={handleCreateEvent}
            onCancel={() => setShowNewForm(false)}
          />
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
        {!loading && !error && visibleEvents.length === 0 && (
          <div className="text-center py-16 rounded-lg border"
            style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
            <Crown size={48} className="mx-auto mb-4 text-blue-500/30" />
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
          {visibleEvents.map(evt => (
            <MgeEventCard
              key={evt.id}
              event={evt}
              isAdmin={isAdmin}
              isOfficer={isOfficer}
              isExpanded={expandedEvents.has(evt.id)}
              onToggle={() => toggleEvent(evt.id)}
              onRefetch={refetch}
              onGenerateMail={handleGenerateMail}
              roster={roster}
            />
          ))}
        </div>
      </div>
    </AppSidebar>
  );
}
