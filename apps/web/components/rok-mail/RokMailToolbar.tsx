'use client';

import { Bold, Italic, Palette, Minus, Sparkles, Eraser, Blend } from 'lucide-react';
import { stripWithPositions } from '@/lib/rok-mail/parser';

interface RokMailToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (content: string) => void;
  onColorClick: () => void;
  onGradientClick: () => void;
  onSymbolClick: () => void;
  editMode: 'source' | 'text';
}

type ToolbarAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'insert'; text: string }
  | { type: 'custom'; handler: () => void };

interface ToolbarButton {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  action: ToolbarAction;
}

export function RokMailToolbar({
  textareaRef,
  content,
  onContentChange,
  onColorClick,
  onGradientClick,
  onSymbolClick,
  editMode,
}: RokMailToolbarProps) {
  /** Map a stripped-text selection range to markup positions */
  function toMarkup(sStart: number, sEnd: number): { mStart: number; mEnd: number } {
    const { positions } = stripWithPositions(content);
    if (positions.length === 0) return { mStart: content.length, mEnd: content.length };
    const mStart = sStart < positions.length ? positions[sStart] : content.length;
    const mEnd = sEnd > 0
      ? (sEnd <= positions.length ? positions[sEnd - 1] + 1 : content.length)
      : positions[0];
    return { mStart, mEnd };
  }

  /** Get markup insertion position (after previous char, staying inside formatting) */
  function toMarkupInsert(sPos: number): number {
    const { positions } = stripWithPositions(content);
    if (positions.length === 0) return content.length;
    if (sPos > 0) return positions[Math.min(sPos - 1, positions.length - 1)] + 1;
    return positions[0];
  }

  function applyAction(action: ToolbarAction) {
    if (action.type === 'custom') {
      action.handler();
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) return;

    const tStart = textarea.selectionStart;
    const tEnd = textarea.selectionEnd;

    if (editMode === 'text') {
      if (action.type === 'wrap') {
        if (tStart === tEnd) {
          // No selection — insert empty tags at insertion point
          const mPos = toMarkupInsert(tStart);
          const newText = content.slice(0, mPos) + action.before + action.after + content.slice(mPos);
          onContentChange(newText);
          setTimeout(() => { textarea.focus(); textarea.setSelectionRange(tStart, tStart); }, 0);
        } else {
          const { mStart, mEnd } = toMarkup(tStart, tEnd);
          const selected = content.slice(mStart, mEnd);
          const newText = content.slice(0, mStart) + action.before + selected + action.after + content.slice(mEnd);
          onContentChange(newText);
          // Stripped text unchanged, cursor at end of selection
          setTimeout(() => { textarea.focus(); textarea.setSelectionRange(tEnd, tEnd); }, 0);
        }
      } else if (action.type === 'insert') {
        const mPos = toMarkupInsert(tStart);
        const newText = content.slice(0, mPos) + action.text + content.slice(mPos);
        onContentChange(newText);
        const cursorPos = tStart + action.text.length;
        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(cursorPos, cursorPos); }, 0);
      }
    } else {
      // Source mode — operate directly on markup
      const selected = content.slice(tStart, tEnd);

      if (action.type === 'wrap') {
        const newText =
          content.slice(0, tStart) +
          action.before +
          selected +
          action.after +
          content.slice(tEnd);
        onContentChange(newText);
        const cursorPos = selected
          ? tStart + action.before.length + selected.length + action.after.length
          : tStart + action.before.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
      } else if (action.type === 'insert') {
        const newText =
          content.slice(0, tStart) + action.text + content.slice(tEnd);
        onContentChange(newText);
        const cursorPos = tStart + action.text.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
      }
    }
  }

  const buttons: ToolbarButton[] = [
    {
      icon: <Bold size={16} />,
      label: 'B',
      tooltip: 'Bold (⌘B)',
      action: { type: 'wrap', before: '<b>', after: '</b>' },
    },
    {
      icon: <Italic size={16} />,
      label: 'I',
      tooltip: 'Italic (⌘I)',
      action: { type: 'wrap', before: '<i>', after: '</i>' },
    },
    {
      icon: <Palette size={16} />,
      label: 'Color',
      tooltip: 'Text Color',
      action: { type: 'custom', handler: onColorClick },
    },
    {
      icon: <Blend size={16} />,
      label: 'Gradient',
      tooltip: 'Color Gradient — select text first',
      action: { type: 'custom', handler: onGradientClick },
    },
    {
      icon: <Minus size={16} />,
      label: 'Divider',
      tooltip: 'Insert Divider Line',
      action: { type: 'insert', text: '━━━━━━━━━━━━━━━━━━━━' },
    },
    {
      icon: <Sparkles size={16} />,
      label: 'Symbols',
      tooltip: 'Insert Symbol',
      action: { type: 'custom', handler: onSymbolClick },
    },
    {
      icon: <Eraser size={16} />,
      label: 'Clear',
      tooltip: 'Clear Formatting — select text first',
      action: { type: 'custom', handler: () => clearFormatting() },
    },
  ];

  function clearFormatting() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const tStart = textarea.selectionStart;
    const tEnd = textarea.selectionEnd;

    if (tStart === tEnd) return;

    if (editMode === 'text') {
      const { mStart, mEnd } = toMarkup(tStart, tEnd);
      const selected = content.slice(mStart, mEnd);
      const stripped = selected
        .replace(/<\/?b>/gi, '')
        .replace(/<\/?i>/gi, '')
        .replace(/<color=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/color>/gi, '')
        .replace(/<size=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/size>/gi, '');
      const newText = content.slice(0, mStart) + stripped + content.slice(mEnd);
      onContentChange(newText);
      // Stripped text unchanged, keep same selection
      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(tStart, tEnd); }, 0);
    } else {
      const selected = content.slice(tStart, tEnd);
      const stripped = selected
        .replace(/<\/?b>/gi, '')
        .replace(/<\/?i>/gi, '')
        .replace(/<color=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/color>/gi, '')
        .replace(/<size=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/size>/gi, '');
      const newText = content.slice(0, tStart) + stripped + content.slice(tEnd);
      onContentChange(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(tStart, tStart + stripped.length);
      }, 0);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key === 'b') {
      e.preventDefault();
      applyAction({ type: 'wrap', before: '<b>', after: '</b>' });
    } else if (isMod && e.key === 'i') {
      e.preventDefault();
      applyAction({ type: 'wrap', before: '<i>', after: '</i>' });
    }
  }

  return {
    toolbar: (
      <div className="flex items-center gap-0.5 p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {buttons.map((btn, i) => (
          <div key={btn.label} className="relative group">
            <button
              type="button"
              onClick={() => applyAction(btn.action)}
              className="p-2 rounded-md transition-fast hover:bg-pink-500/10 hover:text-pink-400"
              style={{ color: 'var(--text-secondary)' }}
            >
              {btn.icon}
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded-md text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
              style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
            >
              {btn.tooltip}
            </div>
          </div>
        ))}
      </div>
    ),
    handleKeyDown,
    applyAction,
  };
}
