'use client';

import { MousePointer2, MoveRight, Pencil, Type, Eraser } from 'lucide-react';
import type { AnnotationTool, ArrowType } from '@/lib/kvk-map-types';

const ARROW_TYPE_COLORS: Record<string, string> = {
  attack: '#ef4444',
  defend: '#3b82f6',
  reinforce: '#22c55e',
  rally: '#f59e0b',
};

const DRAW_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ffffff'];

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  arrowType: ArrowType;
  onArrowTypeChange: (type: ArrowType) => void;
  drawColor: string;
  onDrawColorChange: (color: string) => void;
}

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  arrowType,
  onArrowTypeChange,
  drawColor,
  onDrawColorChange,
}: AnnotationToolbarProps) {
  const tools: { key: AnnotationTool; icon: typeof MousePointer2; label: string }[] = [
    { key: 'select', icon: MousePointer2, label: 'Select' },
    { key: 'arrow', icon: MoveRight, label: 'Arrow' },
    { key: 'draw', icon: Pencil, label: 'Draw' },
    { key: 'text', icon: Type, label: 'Text' },
    { key: 'eraser', icon: Eraser, label: 'Erase' },
  ];

  return (
    <div
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 px-2 py-1.5 rounded-xl"
      style={{
        backgroundColor: 'rgba(10, 14, 26, 0.92)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Tool buttons */}
      {tools.map(({ key, icon: Icon, label }) => {
        const isActive = activeTool === key;
        return (
          <button
            key={key}
            onClick={() => onToolChange(key)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
            title={label}
          >
            <Icon size={14} />
            {isActive && <span>{label}</span>}
          </button>
        );
      })}

      {/* Arrow type sub-options */}
      {activeTool === 'arrow' && (
        <>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          {(['attack', 'defend', 'reinforce', 'rally'] as ArrowType[]).map((type) => (
            <button
              key={type}
              onClick={() => onArrowTypeChange(type)}
              className="px-2 py-1 rounded text-[10px] font-medium capitalize transition-all"
              style={{
                backgroundColor: arrowType === type ? `${ARROW_TYPE_COLORS[type]}22` : 'transparent',
                color: arrowType === type ? ARROW_TYPE_COLORS[type] : 'rgba(255,255,255,0.4)',
                border: arrowType === type ? `1px solid ${ARROW_TYPE_COLORS[type]}44` : '1px solid transparent',
              }}
            >
              {type}
            </button>
          ))}
        </>
      )}

      {/* Draw color sub-options */}
      {activeTool === 'draw' && (
        <>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onDrawColorChange(c)}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                backgroundColor: c,
                border: drawColor === c ? '2px solid #fff' : '2px solid transparent',
                opacity: drawColor === c ? 1 : 0.5,
              }}
            />
          ))}
        </>
      )}

      {/* Text color sub-options */}
      {activeTool === 'text' && (
        <>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onDrawColorChange(c)}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                backgroundColor: c,
                border: drawColor === c ? '2px solid #fff' : '2px solid transparent',
                opacity: drawColor === c ? 1 : 0.5,
              }}
            />
          ))}
        </>
      )}

      {/* Escape hint */}
      {activeTool !== 'select' && (
        <>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <span className="text-[10px] px-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Esc</span>
        </>
      )}
    </div>
  );
}
