'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Check, Trash2 } from 'lucide-react';
import { useWarRoomAuth } from '@/lib/kvk-map/war-room-auth';
import { fetchAllRosterAlliances, type RosterAllianceSummary } from '@/lib/supabase/use-kvk-alliances';
import type { KvkAlliance, AllianceRole } from '@/lib/kvk-map-types';

const ALLIANCE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

interface AllianceListProps {
  alliances: KvkAlliance[];
  onCreate: (data: { tag: string; name: string; role: AllianceRole; color: string }) => void;
  onUpdate: (id: string, updates: Partial<KvkAlliance>) => void;
  onDelete: (id: string) => void;
}

export default function AllianceList({ alliances, onCreate, onUpdate, onDelete }: AllianceListProps) {
  const { isAtLeast } = useWarRoomAuth();
  const canEdit = isAtLeast('officer');

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ tag: '', name: '', role: 'support' as AllianceRole, color: ALLIANCE_COLORS[0] });
  const [rosterAlliances, setRosterAlliances] = useState<RosterAllianceSummary[]>([]);

  // Fetch roster alliances when opening the add form
  useEffect(() => {
    if (!adding) return;
    fetchAllRosterAlliances().then(setRosterAlliances);
  }, [adding]);

  // Alliances already added to the war room
  const existingTags = new Set(alliances.map((a) => a.tag.toUpperCase()));
  const availableRosterAlliances = rosterAlliances.filter((r) => !existingTags.has(r.tag.toUpperCase()));

  const handleSelectRosterAlliance = (tag: string) => {
    const nextColor = ALLIANCE_COLORS[alliances.length % ALLIANCE_COLORS.length];
    setForm({ tag, name: tag, role: 'support', color: nextColor });
  };

  const handleAdd = () => {
    if (!form.tag.trim()) return;
    onCreate({
      tag: form.tag.trim(),
      name: form.name.trim() || form.tag.trim(),
      role: form.role,
      color: form.color,
    });
    setForm({ tag: '', name: '', role: 'support', color: ALLIANCE_COLORS[alliances.length % ALLIANCE_COLORS.length] });
    setAdding(false);
  };

  const handleSaveEdit = (alliance: KvkAlliance) => {
    onUpdate(alliance.id, { tag: form.tag.trim(), name: form.name.trim(), role: form.role, color: form.color });
    setEditingId(null);
  };

  const startEdit = (a: KvkAlliance) => {
    setEditingId(a.id);
    setForm({ tag: a.tag, name: a.name, role: a.role, color: a.color });
  };

  return (
    <div
      className="rounded-xl p-3 border"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Alliances
        </span>
        {canEdit && alliances.length < 7 && !adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} style={{ color: 'var(--text-muted)' }}>
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Alliance list */}
      <div className="space-y-1">
        {alliances.map((a) => (
          editingId === a.id ? (
            <div key={a.id} className="space-y-1.5 p-2 rounded-lg" style={{ backgroundColor: 'var(--background-hover)' }}>
              <div className="flex gap-1.5">
                <input
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  placeholder="Tag"
                  className="w-16 bg-transparent text-xs border rounded px-1.5 py-1 outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Name"
                  className="flex-1 bg-transparent text-xs border rounded px-1.5 py-1 outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {ALLIANCE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor: c,
                        outline: form.color === c ? '2px solid white' : 'none',
                        outlineOffset: '1px',
                      }}
                    />
                  ))}
                </div>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AllianceRole })}
                  className="text-[10px] bg-transparent border rounded px-1 py-0.5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <option value="top">Top</option>
                  <option value="support">Support</option>
                </select>
                <div className="flex-1" />
                <button onClick={() => handleSaveEdit(a)} style={{ color: 'var(--success)' }}><Check size={14} /></button>
                <button onClick={() => setEditingId(null)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                <button onClick={() => { onDelete(a.id); setEditingId(null); }} style={{ color: 'var(--error)' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ) : (
            <button
              key={a.id}
              onClick={() => canEdit && startEdit(a)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all"
              style={{ cursor: canEdit ? 'pointer' : 'default' }}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>[{a.tag}]</span>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: a.role === 'top' ? 'rgba(245,158,11,0.15)' : 'var(--background-hover)',
                  color: a.role === 'top' ? '#f59e0b' : 'var(--text-muted)',
                }}
              >
                {a.role === 'top' ? 'Top' : 'Sup'}
              </span>
            </button>
          )
        ))}
      </div>

      {/* Add new alliance form */}
      {adding && (
        <div className="space-y-1.5 p-2 mt-1 rounded-lg" style={{ backgroundColor: 'var(--background-hover)' }}>
          {/* Roster alliance picker */}
          {availableRosterAlliances.length > 0 && !form.tag && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {availableRosterAlliances.map((r) => (
                <button
                  key={r.tag}
                  onClick={() => handleSelectRosterAlliance(r.tag)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-all hover:brightness-125"
                  style={{ backgroundColor: 'var(--background-card)' }}
                >
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>[{r.tag}]</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                    {r.memberCount} members
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {(r.totalPower / 1e9).toFixed(1)}B
                  </span>
                </button>
              ))}
            </div>
          )}
          {/* Manual tag/name fields (shown after picking or for custom entry) */}
          <div className="flex gap-1.5">
            <input
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              placeholder="Tag"
              autoFocus
              className="w-16 bg-transparent text-xs border rounded px-1.5 py-1 outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className="flex-1 bg-transparent text-xs border rounded px-1.5 py-1 outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {ALLIANCE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className="w-4 h-4 rounded-full"
                  style={{
                    backgroundColor: c,
                    outline: form.color === c ? '2px solid white' : 'none',
                    outlineOffset: '1px',
                  }}
                />
              ))}
            </div>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AllianceRole })}
              className="text-[10px] bg-transparent border rounded px-1 py-0.5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <option value="top">Top</option>
              <option value="support">Support</option>
            </select>
            <div className="flex-1" />
            <button onClick={handleAdd} disabled={!form.tag.trim()} style={{ color: form.tag.trim() ? 'var(--success)' : 'var(--text-muted)' }}><Check size={14} /></button>
            <button onClick={() => setAdding(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
          </div>
        </div>
      )}

      {alliances.length === 0 && !adding && (
        <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
          {canEdit ? 'Click + to add alliances' : 'No alliances yet'}
        </p>
      )}
    </div>
  );
}
