'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, Plus, Check, X, MoveRight, Pencil, Type, MousePointer2, Eraser, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  KvkMapArrow,
  KvkMapDrawing,
  KvkMapLabel,
  KvkZoneNote,
  KvkZoneAction,
  KvkMapZone,
  AnnotationTool,
  ArrowType,
} from '@/lib/kvk-map-types';
import { ARROW_TYPE_COLORS, DRAW_COLORS, getArrowColor } from '@/lib/kvk-map/annotation-constants';

// ─── Tool definitions ────────────────────────────────────────────────

const TOOLS: { key: AnnotationTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { key: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { key: 'arrow', icon: MoveRight, label: 'Arrow', shortcut: 'A' },
  { key: 'draw', icon: Pencil, label: 'Draw', shortcut: 'D' },
  { key: 'text', icon: Type, label: 'Text', shortcut: 'T' },
  { key: 'eraser', icon: Eraser, label: 'Erase', shortcut: 'X' },
];

// ─── Inline Toolbar ──────────────────────────────────────────────────

function AnnotationToolstrip({
  activeTool,
  onToolChange,
  arrowType,
  onArrowTypeChange,
  drawColor,
  onDrawColorChange,
}: {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  arrowType: ArrowType;
  onArrowTypeChange: (type: ArrowType) => void;
  drawColor: string;
  onDrawColorChange: (color: string) => void;
}) {
  return (
    <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ key, icon: Icon, label, shortcut }) => {
          const isActive = activeTool === key;
          return (
            <button
              key={key}
              onClick={() => onToolChange(key)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg transition-all text-[10px]"
              style={{
                backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
              title={`${label} (${shortcut})`}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>

      {/* Arrow type sub-options */}
      {activeTool === 'arrow' && (
        <div className="flex items-center gap-1 mt-1.5">
          {(['attack', 'defend', 'reinforce', 'rally'] as ArrowType[]).map((type) => (
            <button
              key={type}
              onClick={() => onArrowTypeChange(type)}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium capitalize transition-all"
              style={{
                backgroundColor: arrowType === type ? `${ARROW_TYPE_COLORS[type]}22` : 'transparent',
                color: arrowType === type ? ARROW_TYPE_COLORS[type] : 'rgba(255,255,255,0.35)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ARROW_TYPE_COLORS[type] }} />
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Color sub-options */}
      {(activeTool === 'draw' || activeTool === 'text') && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onDrawColorChange(c)}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                backgroundColor: c,
                border: drawColor === c ? '2px solid #fff' : '2px solid transparent',
                opacity: drawColor === c ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Zone Notes Section ─────────────────────────────────────────────

function ZoneNotesSection({
  zone,
  notes,
  stage,
  onSave,
}: {
  zone: KvkMapZone;
  notes: KvkZoneNote[];
  stage: number;
  onSave: (zoneId: string, content: string) => void;
}) {
  const note = notes.find((n) => n.zone_id === zone.id && n.stage === stage);
  const [value, setValue] = useState(note?.content || '');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setValue(note?.content || ''); }, [note?.content, zone.id, stage]);

  const handleChange = (v: string) => {
    setValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSave(zone.id, v), 800);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded" style={{ backgroundColor: zone.color }} />
        <span className="text-[11px] font-medium" style={{ color: 'var(--foreground)' }}>
          {zone.name || `Zone ${zone.zone_number}`}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => { clearTimeout(timerRef.current); onSave(zone.id, value); }}
        placeholder="Battle notes..."
        rows={2}
        className="w-full text-xs px-2 py-1.5 rounded-lg border bg-transparent resize-none"
        style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
      />
    </div>
  );
}

// ─── Zone Actions Section ───────────────────────────────────────────

function ZoneActionsSection({
  zone,
  actions,
  stage,
  onToggle,
  onCreate,
  onDelete,
}: {
  zone: KvkMapZone;
  actions: KvkZoneAction[];
  stage: number;
  onToggle: (id: string, checked: boolean) => void;
  onCreate: (zoneId: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const zoneActions = actions.filter((a) => a.zone_id === zone.id && a.stage === stage);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const handleAdd = () => {
    if (!newLabel.trim()) { setAdding(false); return; }
    onCreate(zone.id, newLabel.trim());
    setNewLabel('');
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded" style={{ backgroundColor: zone.color }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--foreground)' }}>
            {zone.name || `Zone ${zone.zone_number}`}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="p-0.5 rounded hover:bg-white/10 transition-colors"
        >
          <Plus size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {zoneActions.length === 0 && !adding && (
        <p className="text-[10px] pl-3.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          No actions yet
        </p>
      )}

      {zoneActions.map((action) => (
        <div key={action.id} className="flex items-start gap-1.5 pl-3.5 group">
          <button
            onClick={() => onToggle(action.id, !action.is_checked)}
            className="mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all"
            style={{
              borderColor: action.is_checked ? '#22c55e' : 'var(--border)',
              backgroundColor: action.is_checked ? 'rgba(34,197,94,0.2)' : 'transparent',
            }}
          >
            {action.is_checked && <Check size={9} style={{ color: '#22c55e' }} />}
          </button>
          <span
            className="text-[11px] flex-1"
            style={{
              color: action.is_checked ? 'var(--text-muted)' : 'var(--text-secondary)',
              textDecoration: action.is_checked ? 'line-through' : undefined,
              opacity: action.is_checked ? 0.6 : 1,
            }}
          >
            {action.label}
          </span>
          <button
            onClick={() => onDelete(action.id)}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all"
          >
            <X size={10} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      ))}

      {adding && (
        <div className="flex items-center gap-1 pl-3.5">
          <input
            ref={inputRef}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
            }}
            placeholder="Action item..."
            className="flex-1 text-[11px] px-1.5 py-0.5 rounded border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
          <button onClick={handleAdd} className="p-0.5 rounded hover:bg-white/10">
            <Check size={12} style={{ color: '#22c55e' }} />
          </button>
          <button onClick={() => { setAdding(false); setNewLabel(''); }} className="p-0.5 rounded hover:bg-white/10">
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Annotation List Item ───────────────────────────────────────────

function AnnotationListItem({
  type,
  label,
  color,
  isSelected,
  onClick,
  onDelete,
}: {
  type: 'arrow' | 'drawing' | 'label';
  label: string;
  color: string;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const Icon = type === 'arrow' ? MoveRight : type === 'drawing' ? Pencil : Type;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] group cursor-pointer transition-all"
      onClick={onClick}
      style={{
        backgroundColor: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
      }}
    >
      <Icon size={11} style={{ color }} />
      <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all"
      >
        <Trash2 size={10} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────

interface AnnotationPanelProps {
  arrows: KvkMapArrow[];
  drawings: KvkMapDrawing[];
  labels: KvkMapLabel[];
  notes: KvkZoneNote[];
  actions: KvkZoneAction[];
  zones: KvkMapZone[];
  stage: number;
  selectedId: string | null;
  onSelectItem: (type: 'arrow' | 'drawing' | 'label', id: string) => void;
  onDeleteArrow: (id: string) => void;
  onDeleteDrawing: (id: string) => void;
  onDeleteLabel: (id: string) => void;
  onSaveNote: (zoneId: string, content: string) => void;
  onToggleAction: (id: string, checked: boolean) => void;
  onCreateAction: (zoneId: string, label: string) => void;
  onDeleteAction: (id: string) => void;
  onClose: () => void;
  // Annotation toolbar
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  arrowType: ArrowType;
  onArrowTypeChange: (type: ArrowType) => void;
  drawColor: string;
  onDrawColorChange: (color: string) => void;
}

export default function AnnotationPanel({
  arrows,
  drawings,
  labels,
  notes,
  actions,
  zones,
  stage,
  selectedId,
  onSelectItem,
  onDeleteArrow,
  onDeleteDrawing,
  onDeleteLabel,
  onSaveNote,
  onToggleAction,
  onCreateAction,
  onDeleteAction,
  onClose,
  activeTool,
  onToolChange,
  arrowType,
  onArrowTypeChange,
  drawColor,
  onDrawColorChange,
}: AnnotationPanelProps) {
  const [notesOpen, setNotesOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [annotationsOpen, setAnnotationsOpen] = useState(true);

  const stageArrows = useMemo(() => arrows.filter((a) => a.stage === stage), [arrows, stage]);
  const stageDrawings = useMemo(() => drawings.filter((d) => d.stage === stage), [drawings, stage]);
  const stageLabels = useMemo(() => labels.filter((l) => l.stage === stage), [labels, stage]);

  const totalAnnotations = stageArrows.length + stageDrawings.length + stageLabels.length;

  const activeZones = useMemo(() => zones.filter((z) => z.polygon && z.polygon.length > 0), [zones]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          War Plan
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
          <X size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Integrated toolbar */}
      <AnnotationToolstrip
        activeTool={activeTool}
        onToolChange={onToolChange}
        arrowType={arrowType}
        onArrowTypeChange={onArrowTypeChange}
        drawColor={drawColor}
        onDrawColorChange={onDrawColorChange}
      />

      <div className="p-2 space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
        {/* Zone Notes */}
        <div>
          <button
            onClick={() => setNotesOpen(!notesOpen)}
            className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {notesOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Battle Notes
          </button>
          {notesOpen && (
            <div className="space-y-2 px-1">
              {activeZones.map((zone) => (
                <ZoneNotesSection
                  key={zone.id}
                  zone={zone}
                  notes={notes}
                  stage={stage}
                  onSave={onSaveNote}
                />
              ))}
            </div>
          )}
        </div>

        {/* Zone Actions */}
        <div>
          <button
            onClick={() => setActionsOpen(!actionsOpen)}
            className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {actionsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Action Checklist
          </button>
          {actionsOpen && (
            <div className="space-y-2 px-1">
              {activeZones.map((zone) => (
                <ZoneActionsSection
                  key={zone.id}
                  zone={zone}
                  actions={actions}
                  stage={stage}
                  onToggle={onToggleAction}
                  onCreate={onCreateAction}
                  onDelete={onDeleteAction}
                />
              ))}
            </div>
          )}
        </div>

        {/* Annotations list */}
        <div>
          <button
            onClick={() => setAnnotationsOpen(!annotationsOpen)}
            className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {annotationsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Annotations
            {totalAnnotations > 0 && (
              <span className="ml-auto text-[10px] tabular-nums font-normal">{totalAnnotations}</span>
            )}
          </button>
          {annotationsOpen && (
            <div className="space-y-0.5 px-1">
              {totalAnnotations === 0 && (
                <p className="text-[10px] px-2 py-1" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  Select a tool above to draw arrows, freehand lines, or place text labels
                </p>
              )}
              {stageArrows.map((a) => (
                <AnnotationListItem
                  key={a.id}
                  type="arrow"
                  label={a.label || `${a.arrow_type} arrow`}
                  color={a.color_override || getArrowColor(a.arrow_type as ArrowType)}
                  isSelected={a.id === selectedId}
                  onClick={() => onSelectItem('arrow', a.id)}
                  onDelete={() => onDeleteArrow(a.id)}
                />
              ))}
              {stageDrawings.map((d) => (
                <AnnotationListItem
                  key={d.id}
                  type="drawing"
                  label={`Drawing (${d.points.length} pts)`}
                  color={d.color}
                  isSelected={d.id === selectedId}
                  onClick={() => onSelectItem('drawing', d.id)}
                  onDelete={() => onDeleteDrawing(d.id)}
                />
              ))}
              {stageLabels.map((l) => (
                <AnnotationListItem
                  key={l.id}
                  type="label"
                  label={l.text || 'Empty label'}
                  color={l.color}
                  isSelected={l.id === selectedId}
                  onClick={() => onSelectItem('label', l.id)}
                  onDelete={() => onDeleteLabel(l.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
