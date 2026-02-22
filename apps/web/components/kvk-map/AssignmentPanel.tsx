'use client';

import { useState, useEffect } from 'react';
import { Save, Trash2 } from 'lucide-react';
import type { KvkMapFeature, KvkAssignment, KvkAlliance, AssignmentStatus } from '@/lib/kvk-map-types';

const STATUS_OPTIONS: { value: AssignmentStatus; label: string; color: string }[] = [
  { value: 'planned', label: 'Planned', color: '#3b82f6' },
  { value: 'contested', label: 'Contested', color: '#f59e0b' },
  { value: 'occupied', label: 'Occupied', color: '#22c55e' },
  { value: 'lost', label: 'Lost', color: '#ef4444' },
];

interface AssignmentPanelProps {
  feature: KvkMapFeature;
  assignment: KvkAssignment | null;
  alliances: KvkAlliance[];
  onAssign: (featureId: string, allianceId: string, data?: { status?: AssignmentStatus; priority?: number; notes?: string }) => void;
  onUpdate: (assignmentId: string, updates: Partial<KvkAssignment>) => void;
  onUnassign: (assignmentId: string) => void;
}

export default function AssignmentPanel({
  feature,
  assignment,
  alliances,
  onAssign,
  onUpdate,
  onUnassign,
}: AssignmentPanelProps) {
  const [allianceId, setAllianceId] = useState<string>(assignment?.alliance_id ?? '');
  const [status, setStatus] = useState<AssignmentStatus>(assignment?.status ?? 'planned');
  const [notes, setNotes] = useState(assignment?.notes ?? '');

  useEffect(() => {
    setAllianceId(assignment?.alliance_id ?? '');
    setStatus(assignment?.status ?? 'planned');
    setNotes(assignment?.notes ?? '');
  }, [assignment]);

  const handleSave = () => {
    if (!allianceId) return;
    if (assignment) {
      onUpdate(assignment.id, { alliance_id: allianceId, status, notes: notes || null });
    } else {
      onAssign(feature.id, allianceId, { status, notes: notes || undefined });
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Assignment
      </h4>

      {/* Alliance selector */}
      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>Alliance</label>
        <select
          value={allianceId}
          onChange={(e) => setAllianceId(e.target.value)}
          className="w-full text-sm rounded-md px-2 py-1.5 border outline-none"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <option value="">Unassigned</option>
          {alliances.map((a) => (
            <option key={a.id} value={a.id}>[{a.tag}] {a.name}</option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>Status</label>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className="flex-1 text-[10px] font-medium py-1 rounded transition-all"
              style={{
                backgroundColor: status === opt.value ? `${opt.color}20` : 'transparent',
                color: status === opt.value ? opt.color : 'var(--text-muted)',
                border: status === opt.value ? `1px solid ${opt.color}40` : '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className="w-full text-xs rounded-md px-2 py-1.5 border outline-none resize-none"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!allianceId}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: allianceId ? '#4318ff' : 'var(--background-hover)',
            color: allianceId ? 'white' : 'var(--text-muted)',
            cursor: allianceId ? 'pointer' : 'not-allowed',
          }}
        >
          <Save size={12} />
          {assignment ? 'Update' : 'Assign'}
        </button>
        {assignment && (
          <button
            onClick={() => onUnassign(assignment.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
