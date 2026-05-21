'use client';

import { useMemo, useState } from 'react';
import {
  Search,
  Loader2,
  RefreshCw,
  X,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  Swords,
  Inbox,
  Star,
} from 'lucide-react';
import {
  useLeaderApplications,
  updateApplicationStatus,
  updateApplicationRating,
  deleteApplication,
  type LeaderApplicationRow,
  type ApplicationStatus,
} from '@/lib/supabase/use-leader-applications';
import { commanderReferences } from '@/lib/sunset-canyon/commander-reference';

type SortField = 'created_at' | 'kingdom' | 'name' | 'rating';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: { value: ApplicationStatus; label: string; classes: string }[] = [
  { value: 'pending', label: 'Pending', classes: 'bg-blue-500/15 text-blue-400' },
  { value: 'reviewed', label: 'Reviewed', classes: 'bg-amber-500/15 text-amber-400' },
  { value: 'approved', label: 'Approved', classes: 'bg-emerald-500/15 text-emerald-400' },
  { value: 'rejected', label: 'Rejected', classes: 'bg-red-500/15 text-red-400' },
];

function statusBadgeClasses(status: ApplicationStatus): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.classes ?? 'bg-zinc-500/15 text-zinc-400';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function unitLabel(unit: string): string {
  return unit[0].toUpperCase() + unit.slice(1);
}

export function LeaderApplicationsAdmin() {
  const { apps, loading, error, reload } = useLeaderApplications();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'created_at' || field === 'rating' ? 'desc' : 'asc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = apps;

    if (statusFilter !== 'all') {
      rows = rows.filter((a) => a.status === statusFilter);
    }

    if (q) {
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.gov_id.toLowerCase().includes(q) ||
          a.kingdom.toLowerCase().includes(q) ||
          (a.discord ?? '').toLowerCase().includes(q),
      );
    }

    const sign = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      let av: string | number = a[sortField] ?? '';
      let bv: string | number = b[sortField] ?? '';
      if (sortField === 'created_at') {
        av = new Date(a.created_at).getTime();
        bv = new Date(b.created_at).getTime();
      } else if (sortField === 'rating') {
        // Unrated rows sort last regardless of asc/desc.
        av = a.rating ?? -Infinity;
        bv = b.rating ?? -Infinity;
      }
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
    return sorted;
  }, [apps, search, statusFilter, sortField, sortDir]);

  const counts = useMemo(() => {
    const result: Record<ApplicationStatus | 'all', number> = {
      all: apps.length,
      pending: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
    };
    apps.forEach((a) => {
      result[a.status] = (result[a.status] ?? 0) + 1;
    });
    return result;
  }, [apps]);

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    const ok = await updateApplicationStatus(id, status);
    if (ok) reload();
  };

  const handleRatingChange = async (id: string, rating: number | null) => {
    const ok = await updateApplicationRating(id, rating);
    if (ok) reload();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete application from ${name}? This cannot be undone.`)) return;
    const ok = await deleteApplication(id);
    if (ok) reload();
  };

  return (
    <div className="space-y-4">
      {/* Status filter chips — horizontal scroll on overflow so they never wrap awkwardly on mobile */}
      <div className="-mx-1 px-1 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <FilterChip
          label={`All (${counts.all})`}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        {STATUS_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={`${opt.label} (${counts[opt.value]})`}
            active={statusFilter === opt.value}
            classes={opt.classes}
            onClick={() => setStatusFilter(opt.value)}
          />
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, gov ID, kingdom, Discord…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-base sm:text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#4318ff]/40"
        />
      </div>

      {/* Sort + reload — horizontal scroll on mobile if needed */}
      <div className="-mx-1 px-1 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <span className="text-xs text-[var(--text-muted)] self-center pr-1 flex-shrink-0">
          Sort:
        </span>
        <SortButton
          label="Date"
          active={sortField === 'created_at'}
          dir={sortDir}
          onClick={() => toggleSort('created_at')}
        />
        <SortButton
          label="Kingdom"
          active={sortField === 'kingdom'}
          dir={sortDir}
          onClick={() => toggleSort('kingdom')}
        />
        <SortButton
          label="Name"
          active={sortField === 'name'}
          dir={sortDir}
          onClick={() => toggleSort('name')}
        />
        <SortButton
          label="Rating"
          active={sortField === 'rating'}
          dir={sortDir}
          onClick={() => toggleSort('rating')}
        />
        <button
          type="button"
          onClick={reload}
          className="ml-auto flex-shrink-0 p-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)] transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
          <Inbox className="w-8 h-8 mb-2" />
          <p className="text-sm">No applications match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              expanded={expanded.has(app.id)}
              onToggle={() => toggleExpanded(app.id)}
              onStatusChange={(s) => handleStatusChange(app.id, s)}
              onRatingChange={(r) => handleRatingChange(app.id, r)}
              onDelete={() => handleDelete(app.id, app.name)}
              onOpenImage={(url) => setLightbox(url)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightbox}
            alt="Commander screenshot"
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  classes?: string;
  onClick: () => void;
}

function FilterChip({ label, active, classes, onClick }: FilterChipProps) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors';
  if (active) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${classes ?? 'bg-[#4318ff] text-white'}`}>
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} bg-[var(--background-secondary)] text-[var(--text-secondary)] hover:text-[var(--foreground)] border border-[var(--border)]`}
    >
      {label}
    </button>
  );
}

interface SortButtonProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}

function SortButton({ label, active, dir, onClick }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
        active
          ? 'bg-[#4318ff]/10 border-[#4318ff]/40 text-[#a78bfa]'
          : 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]'
      }`}
    >
      {label}
      {active && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
    </button>
  );
}

interface ApplicationCardProps {
  app: LeaderApplicationRow;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  onRatingChange: (rating: number | null) => void;
  onDelete: () => void;
  onOpenImage: (url: string) => void;
}

function ApplicationCard({
  app,
  expanded,
  onToggle,
  onStatusChange,
  onRatingChange,
  onDelete,
  onOpenImage,
}: ApplicationCardProps) {
  const roles = app.leader_application_roles ?? [];
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === app.status)?.label ?? app.status;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] overflow-hidden">
      {/* Whole header is tappable — turns into a single big touch target on mobile */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 sm:p-4 hover:bg-[var(--background-hover)]/40 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[var(--background-secondary)] flex-shrink-0">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-[var(--foreground)] truncate">{app.name}</p>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusBadgeClasses(app.status)}`}
              >
                {statusLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)] mt-1">
              <span>K{app.kingdom}</span>
              <span>·</span>
              <span>ID {app.gov_id}</span>
              {app.discord && (
                <>
                  <span>·</span>
                  <span className="truncate">@{app.discord}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)] mt-0.5">
              <span>{formatDate(app.created_at)}</span>
              <span>·</span>
              <span>
                {roles.length} role{roles.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Actions row — rating + status + delete. Wraps on small screens. */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 px-3 sm:px-4 pb-3 sm:pb-4">
        <StarRating value={app.rating} onChange={onRatingChange} />
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <label className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
            Status
          </label>
          <select
            value={app.status}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
            className="flex-1 sm:flex-initial text-sm px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[#4318ff]/40"
            aria-label="Update status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto p-2 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Delete application"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-3 sm:p-4 space-y-4 bg-[var(--background-secondary)]/30">
          {app.notes && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</p>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{app.notes}</p>
            </div>
          )}

          <div className="space-y-3">
            {roles.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No role entries.</p>
            ) : (
              roles.map((role, idx) => (
                <div
                  key={role.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background-card)] p-3"
                >
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-3 text-xs font-medium text-[var(--text-secondary)]">
                    {role.role_type === 'rally' ? (
                      <Swords className="w-3.5 h-3.5" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                    <span>Role {idx + 1}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{unitLabel(role.unit_type)}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="capitalize">{role.role_type}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CommanderSlot
                      label="Primary"
                      commanderId={role.primary_commander_id}
                      commanderName={role.primary_commander_name}
                      gearUrl={role.primary_gear_url}
                      armamentsUrl={role.primary_armaments_url}
                      onOpen={onOpenImage}
                    />
                    <CommanderSlot
                      label="Secondary"
                      commanderId={role.secondary_commander_id}
                      commanderName={role.secondary_commander_name}
                      gearUrl={role.secondary_gear_url}
                      armamentsUrl={role.secondary_armaments_url}
                      onOpen={onOpenImage}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface StarRatingProps {
  value: number | null;
  onChange: (rating: number | null) => void;
}

/** 1-5 clickable stars. Tap a filled star to clear back to unrated. */
function StarRating({ value, onChange }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;

  return (
    <div
      className="flex items-center"
      onMouseLeave={() => setHover(null)}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= display;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            onMouseEnter={() => setHover(n)}
            className="p-1 -mx-0.5 transition-transform active:scale-90"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={value === n}
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                active
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-[var(--text-muted)]/40 hover:text-[var(--text-muted)]'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

interface CommanderSlotProps {
  label: string;
  commanderId: string | null;
  commanderName: string | null;
  gearUrl: string | null;
  armamentsUrl: string | null;
  onOpen: (url: string) => void;
}

function CommanderSlot({
  label,
  commanderId,
  commanderName,
  gearUrl,
  armamentsUrl,
  onOpen,
}: CommanderSlotProps) {
  const commander = commanderId
    ? commanderReferences.find((c) => c.id === commanderId)
    : null;
  const displayName = commander?.name ?? commanderName ?? null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-secondary)]/50 p-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
        {label}
      </p>
      <div className="mb-2">
        <p className="text-sm font-medium text-[var(--foreground)] truncate">
          {displayName ?? '—'}
        </p>
        {commander && (
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">
            {commander.specialties.slice(0, 2).join(' · ')}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ScreenshotThumb label="Gear" url={gearUrl} onOpen={onOpen} />
        <ScreenshotThumb label="Armaments" url={armamentsUrl} onOpen={onOpen} />
      </div>
    </div>
  );
}

interface ScreenshotThumbProps {
  label: string;
  url: string | null;
  onOpen: (url: string) => void;
}

function ScreenshotThumb({ label, url, onOpen }: ScreenshotThumbProps) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </p>
      {url ? (
        <button
          type="button"
          onClick={() => onOpen(url)}
          className="group relative block w-full"
        >
          <img
            src={url}
            alt={label}
            className="w-full aspect-square object-cover rounded-md border border-[var(--border)]"
          />
          <div className="absolute inset-0 rounded-md bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <ExternalLink className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      ) : (
        <div className="w-full aspect-square rounded-md border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
          —
        </div>
      )}
    </div>
  );
}
