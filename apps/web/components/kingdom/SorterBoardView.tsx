'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { matchesSearch } from '@/lib/search';
import { Search, Eye, EyeOff, ChevronDown } from 'lucide-react';
import type { AllianceConfig, PlayerAssignment, AssignmentStatus, ScanPlayer } from '@/lib/kingdom/types';
import { SORTER_ALLIANCE_COLORS, formatNumber, toSorterTag } from '@/lib/kingdom/config';
import type { NameHistoryMap } from '@/lib/supabase/use-name-history';
import { NameHistoryBadge } from './NameHistoryBadge';

interface SorterBoardViewProps {
  players: ScanPlayer[];
  assignments: PlayerAssignment[];
  configs: AllianceConfig[];
  statusFilter: AssignmentStatus | 'ALL';
  onAssignmentsChange: (updated: PlayerAssignment[]) => void;
  nameHistory?: NameHistoryMap;
}

const UNASSIGNED_COL = '__UNASSIGNED__';

export default function SorterBoardView({
  players,
  assignments,
  configs,
  statusFilter,
  onAssignmentsChange,
  nameHistory,
}: SorterBoardViewProps) {
  const [search, setSearch] = useState('');
  const [showMovesOnly, setShowMovesOnly] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build assignment map
  const assignmentMap = useMemo(() => {
    const map = new Map<number, PlayerAssignment>();
    for (const a of assignments) map.set(a.governorId, a);
    return map;
  }, [assignments]);

  // Build player map
  const playerMap = useMemo(() => {
    const map = new Map<number, ScanPlayer>();
    for (const p of players) map.set(p.governor_id, p);
    return map;
  }, [players]);

  // Group players by assigned alliance
  const columns = useMemo(() => {
    const cols: Record<string, { govId: number; player: ScanPlayer; assignment: PlayerAssignment }[]> = {};

    for (const cfg of configs) {
      cols[cfg.tag] = [];
    }
    cols[UNASSIGNED_COL] = [];

    for (const a of assignments) {
      const player = playerMap.get(a.governorId);
      if (!player) continue;

      // Search filter
      if (search.trim() && !matchesSearch(search, player.name, player.governor_id)) {
        continue;
      }

      // Status filter (from clickable badges)
      if (statusFilter !== 'ALL' && a.status !== statusFilter) continue;

      // Moves only filter
      if (showMovesOnly && a.status === 'STAY') continue;

      const col = a.assignedAlliance && cols[a.assignedAlliance] ? a.assignedAlliance : UNASSIGNED_COL;
      cols[col].push({ govId: a.governorId, player, assignment: a });
    }

    // Sort each column by power desc
    for (const col of Object.values(cols)) {
      col.sort((a, b) => b.player.power - a.player.power);
    }

    return cols;
  }, [assignments, players, playerMap, configs, search, showMovesOnly, statusFilter]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const govId = active.id as number;
    const targetCol = over.id as string;

    // Find current assignment
    const current = assignmentMap.get(govId);
    if (!current) return;

    // Same column — no change
    if (current.assignedAlliance === targetCol) return;
    if (!current.assignedAlliance && targetCol === UNASSIGNED_COL) return;

    const player = playerMap.get(govId);
    if (!player) return;

    const newAlliance = targetCol === UNASSIGNED_COL ? '' : targetCol;
    const currentTag = toSorterTag(player.current_alliance);
    const newStatus = newAlliance === currentTag ? 'STAY' as const : 'MOVE' as const;

    const updated = assignments.map(a =>
      a.governorId === govId
        ? { ...a, assignedAlliance: newAlliance, status: newStatus, reason: 'Manual override' }
        : a
    );

    onAssignmentsChange(updated);
  };

  const handleReassign = (govId: number, newAlliance: string) => {
    const player = playerMap.get(govId);
    if (!player) return;

    const currentTag = toSorterTag(player.current_alliance);
    const newStatus: AssignmentStatus = !newAlliance
      ? 'UNASSIGNED'
      : newAlliance === currentTag
        ? 'STAY'
        : 'MOVE';

    const updated = assignments.map(a =>
      a.governorId === govId
        ? { ...a, assignedAlliance: newAlliance, status: newStatus, reason: 'Manual override' }
        : a
    );

    onAssignmentsChange(updated);
  };

  const activePlayer = activeId ? playerMap.get(activeId) : null;
  const activeAssignment = activeId ? assignmentMap.get(activeId) : null;

  return (
    <div>
      {/* Board controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <button
          onClick={() => setShowMovesOnly(!showMovesOnly)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            showMovesOnly
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
              : 'bg-[var(--background-secondary)] text-[var(--text-secondary)] border-[var(--border)]'
          }`}
        >
          {showMovesOnly ? <Eye size={16} /> : <EyeOff size={16} />}
          {showMovesOnly ? 'Showing moves only' : 'Show all'}
        </button>
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {configs.map(cfg => (
            <BoardColumn
              key={cfg.tag}
              id={cfg.tag}
              label={cfg.tag}
              color={SORTER_ALLIANCE_COLORS[cfg.tag] || '#666'}
              cap={cfg.cap}
              items={columns[cfg.tag] || []}
              allianceTags={configs.map(c => c.tag)}
              onReassign={handleReassign}
              nameHistory={nameHistory}
            />
          ))}
          <BoardColumn
            id={UNASSIGNED_COL}
            label="Unassigned"
            color="#666"
            cap={null}
            items={columns[UNASSIGNED_COL] || []}
            allianceTags={configs.map(c => c.tag)}
            onReassign={handleReassign}
            nameHistory={nameHistory}
          />
        </div>

        <DragOverlay>
          {activePlayer && activeAssignment ? (
            <PlayerCard player={activePlayer} assignment={activeAssignment} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BoardColumn({
  id,
  label,
  color,
  cap,
  items,
  allianceTags,
  onReassign,
  nameHistory,
}: {
  id: string;
  label: string;
  color: string;
  cap: number | null;
  items: { govId: number; player: ScanPlayer; assignment: PlayerAssignment }[];
  allianceTags: string[];
  onReassign: (govId: number, newAlliance: string) => void;
  nameHistory?: NameHistoryMap;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-48 sm:w-56 rounded-xl border transition-colors ${
        isOver ? 'border-amber-500/50 bg-amber-500/5' : 'border-[var(--border)] bg-[var(--background-card)]'
      }`}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-[var(--foreground)]">{label}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          {items.length}{cap !== null ? `/${cap}` : ''} players
        </div>
      </div>

      {/* Player cards */}
      <div className="p-1.5 space-y-1 max-h-[60vh] overflow-y-auto">
        {items.map(({ govId, player, assignment }) => (
          <DraggablePlayerCard
            key={govId}
            govId={govId}
            player={player}
            assignment={assignment}
            allianceTags={allianceTags}
            onReassign={onReassign}
            previousNames={nameHistory?.get(govId) || []}
          />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] text-center py-4">
            No players
          </div>
        )}
      </div>
    </div>
  );
}

function DraggablePlayerCard({
  govId,
  player,
  assignment,
  allianceTags,
  onReassign,
  previousNames,
}: {
  govId: number;
  player: ScanPlayer;
  assignment: PlayerAssignment;
  allianceTags: string[];
  onReassign: (govId: number, newAlliance: string) => void;
  previousNames?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: govId,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PlayerCard
        player={player}
        assignment={assignment}
        isDragging={isDragging}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        allianceTags={allianceTags}
        onReassign={(newAlliance) => onReassign(govId, newAlliance)}
        previousNames={previousNames}
      />
    </div>
  );
}

function PlayerCard({
  player,
  assignment,
  isDragging,
  expanded,
  onToggle,
  allianceTags,
  onReassign,
  previousNames,
}: {
  player: ScanPlayer;
  assignment: PlayerAssignment;
  isDragging?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  allianceTags?: string[];
  onReassign?: (newAlliance: string) => void;
  previousNames?: string[];
}) {
  const statusColors: Record<string, string> = {
    STAY: 'border-l-emerald-500',
    MOVE: 'border-l-sky-500',
    INCOMING: 'border-l-violet-500',
    ILLEGAL: 'border-l-red-500',
    UNASSIGNED: 'border-l-gray-500',
  };

  return (
    <div
      onClick={(e) => {
        // Only toggle on click, not on drag or select interactions
        if (onToggle && !(e.target as HTMLElement).closest('select')) onToggle();
      }}
      className={`px-2.5 py-1.5 rounded-lg border-l-2 text-xs cursor-grab active:cursor-grabbing transition-all ${
        statusColors[assignment.status] || 'border-l-gray-500'
      } ${
        isDragging
          ? 'bg-amber-500/10 border border-amber-500/30 shadow-lg opacity-90'
          : expanded
            ? 'bg-[var(--background-secondary)] ring-1 ring-amber-500/30'
            : 'bg-[var(--background-secondary)] hover:bg-[var(--background-secondary)]/80'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="font-medium text-[var(--foreground)] truncate flex items-center gap-0.5">
          {player.name}
          <NameHistoryBadge previousNames={previousNames || []} size="sm" />
        </div>
        {onToggle && (
          <ChevronDown size={10} className={`text-[var(--text-muted)] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[var(--text-muted)] font-mono">{formatNumber(player.power)}</span>
        {assignment.status !== 'STAY' && (
          <span className={`text-[10px] font-medium ${
            assignment.status === 'MOVE' ? 'text-sky-500' :
            assignment.status === 'INCOMING' ? 'text-violet-500' :
            assignment.status === 'ILLEGAL' ? 'text-red-500' :
            'text-gray-400'
          }`}>
            {assignment.status}
          </span>
        )}
      </div>
      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] space-y-1">
          <div className="text-[var(--text-muted)]">#{player.governor_id}</div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">KP</span>
            <span className="font-mono text-[var(--foreground)]">{player.kill_points > 0 ? formatNumber(player.kill_points) : '-'}</span>
          </div>
          {allianceTags && onReassign && (
            <select
              value={assignment.assignedAlliance || ''}
              onChange={(e) => { e.stopPropagation(); onReassign(e.target.value); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full px-1.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="">— Unassigned</option>
              {allianceTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
