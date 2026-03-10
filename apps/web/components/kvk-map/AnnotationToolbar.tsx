'use client';

import { useState } from 'react';
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

const TOOLS: { key: AnnotationTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { key: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { key: 'arrow', icon: MoveRight, label: 'Arrow', shortcut: 'A' },
  { key: 'draw', icon: Pencil, label: 'Draw', shortcut: 'D' },
  { key: 'text', icon: Type, label: 'Text', shortcut: 'T' },
  { key: 'eraser', icon: Eraser, label: 'Erase', shortcut: 'X' },
];

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  arrowType,
  onArrowTypeChange,
  drawColor,
  onDrawColorChange,
}: AnnotationToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<AnnotationTool | null>(null);

  // Show sub-options popover for the active tool
  const showArrowOptions = activeTool === 'arrow';
  const showColorOptions = activeTool === 'draw' || activeTool === 'text';

  return (
    <div
      className="absolute left-3 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-0.5 p-1.5 rounded-xl"
      style={{
        backgroundColor: 'rgba(10, 14, 26, 0.92)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {TOOLS.map(({ key, icon: Icon, label, shortcut }) => {
        const isActive = activeTool === key;
        return (
          <button
            key={key}
            onClick={() => onToolChange(key)}
            onMouseEnter={() => setHoveredTool(key)}
            onMouseLeave={() => setHoveredTool(null)}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{
              backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
            }}
            title={`${label} (${shortcut})`}
          >
            <Icon size={15} />
            {/* Tooltip on hover */}
            {hoveredTool === key && !isActive && (
              <div
                className="absolute left-full ml-2 px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap pointer-events-none"
                style={{ backgroundColor: 'rgba(0,0,0,0.9)', color: '#fff' }}
              >
                {label} <span style={{ color: 'rgba(255,255,255,0.4)' }}>{shortcut}</span>
              </div>
            )}
          </button>
        );
      })}

      {/* Arrow type popover — expands right */}
      {showArrowOptions && (
        <div
          className="absolute left-full top-[36px] ml-2 flex flex-col gap-0.5 p-1 rounded-lg"
          style={{
            backgroundColor: 'rgba(10, 14, 26, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {(['attack', 'defend', 'reinforce', 'rally'] as ArrowType[]).map((type) => (
            <button
              key={type}
              onClick={() => onArrowTypeChange(type)}
              className="px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-all text-left"
              style={{
                backgroundColor: arrowType === type ? `${ARROW_TYPE_COLORS[type]}22` : 'transparent',
                color: arrowType === type ? ARROW_TYPE_COLORS[type] : 'rgba(255,255,255,0.4)',
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: ARROW_TYPE_COLORS[type] }} />
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Color popover — expands right */}
      {showColorOptions && (
        <div
          className="absolute left-full ml-2 flex flex-col gap-1 p-1.5 rounded-lg"
          style={{
            top: activeTool === 'draw' ? '72px' : '108px',
            backgroundColor: 'rgba(10, 14, 26, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
          }}
        >
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
        </div>
      )}
    </div>
  );
}
