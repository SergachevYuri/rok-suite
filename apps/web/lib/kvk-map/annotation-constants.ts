import type { ArrowType } from '@/lib/kvk-map-types';

export const ARROW_TYPE_COLORS: Record<ArrowType, string> = {
  attack: '#ef4444',
  defend: '#3b82f6',
  reinforce: '#22c55e',
  rally: '#f59e0b',
};

export const DRAW_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ffffff'];

export function getArrowColor(type: ArrowType): string {
  return ARROW_TYPE_COLORS[type] || '#ef4444';
}
