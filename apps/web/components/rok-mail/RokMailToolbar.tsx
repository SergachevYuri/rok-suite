'use client';

import { Bold, Italic, Palette, Minus, Plus, Sparkles, Eraser, Blend, Undo2, Redo2, Scissors } from 'lucide-react';
import { stripWithPositions } from '@/lib/rok-mail/parser';

const SIZE_STEP = 5;
const SIZE_MIN = 10;
const SIZE_MAX = 80;

interface RokMailToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (content: string) => void;
  onColorClick: () => void;
  onGradientClick: () => void;
  onSymbolClick: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  editMode: 'source' | 'text';
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSaveSnapshot: () => void;
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
  fontSize,
  onFontSizeChange,
  editMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveSnapshot,
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

  /**
   * Check if text at markup [mStart, mEnd) is wrapped by open/close tags,
   * allowing other formatting tags in between. Returns wrapping tag positions or null.
   */
  function findWrapping(
    before: string,
    after: string,
    mStart: number,
    mEnd: number
  ): { tagStart: number; afterEnd: number } | null {
    let pos = mStart;
    while (pos > 0) {
      if (content.slice(pos - before.length, pos) === before) {
        const tagStart = pos - before.length;
        let endPos = mEnd;
        while (endPos < content.length) {
          if (content.startsWith(after, endPos)) {
            return { tagStart, afterEnd: endPos + after.length };
          }
          const closeMatch = content.slice(endPos).match(/^<\/[^>]+>/);
          if (closeMatch) {
            endPos += closeMatch[0].length;
          } else {
            break;
          }
        }
        return null;
      }
      const tagMatch = content.slice(0, pos).match(/<[^/][^>]*>$/);
      if (tagMatch) {
        pos -= tagMatch[0].length;
      } else {
        break;
      }
    }
    return null;
  }

  /**
   * Find any <size=NNpx> wrapping around the markup range.
   * Returns the tag info or null.
   */
  function findAnySizeWrapping(
    mStart: number,
    mEnd: number
  ): { tagStart: number; afterEnd: number; size: number; openTag: string } | null {
    let pos = mStart;
    while (pos > 0) {
      const sizeMatch = content.slice(0, pos).match(/<size=(\d+)px>$/i);
      if (sizeMatch) {
        const tagStart = pos - sizeMatch[0].length;
        let endPos = mEnd;
        while (endPos < content.length) {
          if (content.startsWith('</size>', endPos)) {
            return {
              tagStart,
              afterEnd: endPos + 7,
              size: parseInt(sizeMatch[1], 10),
              openTag: sizeMatch[0],
            };
          }
          const closeMatch = content.slice(endPos).match(/^<\/[^>]+>/);
          if (closeMatch) {
            endPos += closeMatch[0].length;
          } else {
            break;
          }
        }
        return null;
      }
      const tagMatch = content.slice(0, pos).match(/<[^/][^>]*>$/);
      if (tagMatch) {
        pos -= tagMatch[0].length;
      } else {
        break;
      }
    }
    return null;
  }

  /**
   * Expand a markup range to include adjacent opening tags before mStart
   * and adjacent closing tags after mEnd.
   */
  function expandToTags(mStart: number, mEnd: number): { start: number; end: number } {
    let start = mStart;
    let end = mEnd;
    while (start > 0) {
      const tagMatch = content.slice(0, start).match(/<[^>]+>$/);
      if (tagMatch) {
        start -= tagMatch[0].length;
      } else {
        break;
      }
    }
    while (end < content.length) {
      const tagMatch = content.slice(end).match(/^<[^>]+>/);
      if (tagMatch) {
        end += tagMatch[0].length;
      } else {
        break;
      }
    }
    return { start, end };
  }

  /** Restore cursor position and scroll after a content change */
  function restoreCursor(textarea: HTMLTextAreaElement, selStart: number, selEnd: number, scroll: number) {
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(selStart, selEnd);
      textarea.scrollTop = scroll;
    }, 0);
  }

  function applyAction(action: ToolbarAction) {
    if (action.type === 'custom') {
      onSaveSnapshot();
      action.handler();
      return;
    }

    onSaveSnapshot();
    const textarea = textareaRef.current;
    if (!textarea) return;

    const tStart = textarea.selectionStart;
    const tEnd = textarea.selectionEnd;
    const scroll = textarea.scrollTop;

    if (editMode === 'text') {
      if (action.type === 'wrap') {
        if (tStart === tEnd) {
          const mPos = toMarkupInsert(tStart);
          const newText = content.slice(0, mPos) + action.before + action.after + content.slice(mPos);
          onContentChange(newText);
          restoreCursor(textarea, tStart, tStart, scroll);
        } else {
          const { mStart, mEnd } = toMarkup(tStart, tEnd);
          // Toggle: if already wrapped, remove the tags instead
          const wrapping = findWrapping(action.before, action.after, mStart, mEnd);
          if (wrapping) {
            const newText = content.slice(0, wrapping.tagStart)
              + content.slice(wrapping.tagStart + action.before.length, wrapping.afterEnd - action.after.length)
              + content.slice(wrapping.afterEnd);
            onContentChange(newText);
            restoreCursor(textarea, tStart, tEnd, scroll);
          } else {
            // Expand range to include adjacent tags so new wrapper nests outside them
            const { start: wrapStart, end: wrapEnd } = expandToTags(mStart, mEnd);
            const selected = content.slice(wrapStart, wrapEnd);
            const newText = content.slice(0, wrapStart) + action.before + selected + action.after + content.slice(wrapEnd);
            onContentChange(newText);
            restoreCursor(textarea, tStart, tEnd, scroll);
          }
        }
      } else if (action.type === 'insert') {
        const mPos = toMarkupInsert(tStart);
        const newText = content.slice(0, mPos) + action.text + content.slice(mPos);
        onContentChange(newText);
        const cursorPos = tStart + action.text.length;
        restoreCursor(textarea, cursorPos, cursorPos, scroll);
      }
    } else {
      // Source mode — operate directly on markup
      const selected = content.slice(tStart, tEnd);

      if (action.type === 'wrap') {
        if (selected.startsWith(action.before) && selected.endsWith(action.after)) {
          const inner = selected.slice(action.before.length, selected.length - action.after.length);
          const newText = content.slice(0, tStart) + inner + content.slice(tEnd);
          onContentChange(newText);
          restoreCursor(textarea, tStart, tStart + inner.length, scroll);
        } else {
          const wrapping = findWrapping(action.before, action.after, tStart, tEnd);
          if (wrapping) {
            const newText = content.slice(0, wrapping.tagStart)
              + content.slice(wrapping.tagStart + action.before.length, wrapping.afterEnd - action.after.length)
              + content.slice(wrapping.afterEnd);
            onContentChange(newText);
            const newStart = tStart - action.before.length;
            restoreCursor(textarea, newStart, newStart + selected.length, scroll);
          } else {
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
            restoreCursor(textarea, cursorPos, cursorPos, scroll);
          }
        }
      } else if (action.type === 'insert') {
        const newText =
          content.slice(0, tStart) + action.text + content.slice(tEnd);
        onContentChange(newText);
        const cursorPos = tStart + action.text.length;
        restoreCursor(textarea, cursorPos, cursorPos, scroll);
      }
    }
  }

  /**
   * Change font size: detects existing <size> wrapping and replaces the value,
   * or wraps with a new tag if none exists. Preserves selection.
   */
  function handleSizeChange(direction: 1 | -1) {
    onSaveSnapshot();
    const textarea = textareaRef.current;
    if (!textarea) return;

    const tStart = textarea.selectionStart;
    const tEnd = textarea.selectionEnd;
    const scroll = textarea.scrollTop;

    const newSize = Math.max(SIZE_MIN, Math.min(SIZE_MAX, fontSize + direction * SIZE_STEP));
    if (newSize === fontSize) return;
    onFontSizeChange(newSize);

    if (editMode === 'text') {
      const { mStart, mEnd } = tStart !== tEnd
        ? toMarkup(tStart, tEnd)
        : { mStart: toMarkupInsert(tStart), mEnd: toMarkupInsert(tStart) };

      const existing = findAnySizeWrapping(mStart, mEnd);
      if (existing) {
        const newTag = `<size=${newSize}px>`;
        const newText = content.slice(0, existing.tagStart) + newTag
          + content.slice(existing.tagStart + existing.openTag.length);
        onContentChange(newText);
        restoreCursor(textarea, tStart, tEnd, scroll);
      } else if (tStart !== tEnd) {
        const { start: wrapStart, end: wrapEnd } = expandToTags(mStart, mEnd);
        const selected = content.slice(wrapStart, wrapEnd);
        const newText = content.slice(0, wrapStart) + `<size=${newSize}px>` + selected + '</size>' + content.slice(wrapEnd);
        onContentChange(newText);
        restoreCursor(textarea, tStart, tEnd, scroll);
      }
    } else {
      const existing = findAnySizeWrapping(tStart, tEnd);
      if (existing) {
        const newTag = `<size=${newSize}px>`;
        const newText = content.slice(0, existing.tagStart) + newTag
          + content.slice(existing.tagStart + existing.openTag.length);
        onContentChange(newText);
        const offset = newTag.length - existing.openTag.length;
        restoreCursor(textarea, tStart + offset, tEnd + offset, scroll);
      } else if (tStart !== tEnd) {
        const selected = content.slice(tStart, tEnd);
        const before = `<size=${newSize}px>`;
        const newText = content.slice(0, tStart) + before + selected + '</size>' + content.slice(tEnd);
        onContentChange(newText);
        const cursorPos = tStart + before.length + selected.length + 7;
        restoreCursor(textarea, cursorPos, cursorPos, scroll);
      }
    }
  }

  function handleFontSizeInput(value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= SIZE_MIN && num <= SIZE_MAX) {
      onFontSizeChange(num);
      const textarea = textareaRef.current;
      if (!textarea) return;
      const tStart = textarea.selectionStart;
      const tEnd = textarea.selectionEnd;
      const scroll = textarea.scrollTop;

      if (tStart !== tEnd) {
        onSaveSnapshot();
        if (editMode === 'text') {
          const { mStart, mEnd } = toMarkup(tStart, tEnd);
          const existing = findAnySizeWrapping(mStart, mEnd);
          if (existing) {
            const newTag = `<size=${num}px>`;
            const newText = content.slice(0, existing.tagStart) + newTag
              + content.slice(existing.tagStart + existing.openTag.length);
            onContentChange(newText);
            restoreCursor(textarea, tStart, tEnd, scroll);
          } else {
            const { start: wrapStart, end: wrapEnd } = expandToTags(mStart, mEnd);
            const selected = content.slice(wrapStart, wrapEnd);
            const newText = content.slice(0, wrapStart) + `<size=${num}px>` + selected + '</size>' + content.slice(wrapEnd);
            onContentChange(newText);
            restoreCursor(textarea, tStart, tEnd, scroll);
          }
        } else {
          const existing = findAnySizeWrapping(tStart, tEnd);
          if (existing) {
            const newTag = `<size=${num}px>`;
            const newText = content.slice(0, existing.tagStart) + newTag
              + content.slice(existing.tagStart + existing.openTag.length);
            onContentChange(newText);
          } else {
            const selected = content.slice(tStart, tEnd);
            const newText = content.slice(0, tStart) + `<size=${num}px>` + selected + '</size>' + content.slice(tEnd);
            onContentChange(newText);
          }
        }
      }
    }
  }

  const formatButtons: ToolbarButton[] = [
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
  ];

  const insertButtons: ToolbarButton[] = [
    {
      icon: <Minus size={16} />,
      label: 'Divider',
      tooltip: 'Insert Divider Line',
      action: { type: 'insert', text: '━━━━━━━━━━━━━━━━━━━━' },
    },
    {
      icon: <Scissors size={16} />,
      label: 'Break',
      tooltip: 'Insert Break — splits mail into parts',
      action: { type: 'insert', text: '\n---\n' },
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
    const scroll = textarea.scrollTop;

    if (tStart === tEnd) return;

    onSaveSnapshot();
    if (editMode === 'text') {
      const { mStart, mEnd } = toMarkup(tStart, tEnd);
      const { start: expStart, end: expEnd } = expandToTags(mStart, mEnd);
      const selected = content.slice(expStart, expEnd);
      const stripped = selected
        .replace(/<\/?b>/gi, '')
        .replace(/<\/?i>/gi, '')
        .replace(/<color=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/color>/gi, '')
        .replace(/<size=["']?[^"'>]*["']?>/gi, '')
        .replace(/<\/size>/gi, '');
      const newText = content.slice(0, expStart) + stripped + content.slice(expEnd);
      onContentChange(newText);
      restoreCursor(textarea, tStart, tEnd, scroll);
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
      restoreCursor(textarea, tStart, tStart + stripped.length, scroll);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if (isMod && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      onRedo();
    } else if (isMod && e.key === 'b') {
      e.preventDefault();
      applyAction({ type: 'wrap', before: '<b>', after: '</b>' });
    } else if (isMod && e.key === 'i') {
      e.preventDefault();
      applyAction({ type: 'wrap', before: '<i>', after: '</i>' });
    }
  }

  const undoRedoButtons = [
    { icon: <Undo2 size={16} />, label: 'Undo', tooltip: 'Undo (⌘Z)', handler: onUndo, disabled: !canUndo },
    { icon: <Redo2 size={16} />, label: 'Redo', tooltip: 'Redo (⌘⇧Z)', handler: onRedo, disabled: !canRedo },
  ];

  function renderButton(btn: ToolbarButton) {
    return (
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
    );
  }

  return {
    toolbar: (
      <div className="flex items-center gap-0.5 p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {undoRedoButtons.map((btn) => (
          <div key={btn.label} className="relative group">
            <button
              type="button"
              onClick={btn.handler}
              disabled={btn.disabled}
              className="p-2 rounded-md transition-fast hover:bg-pink-500/10 hover:text-pink-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
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
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
        {formatButtons.map(renderButton)}
        {/* Inline font size: − [value] + */}
        <div className="flex items-center mx-0.5 relative group">
          <button
            type="button"
            onClick={() => handleSizeChange(-1)}
            className="p-1.5 rounded-l-md border border-r-0 transition-fast hover:bg-pink-500/10 hover:text-pink-400"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            value={fontSize}
            onChange={(e) => handleFontSizeInput(e.target.value)}
            className="w-9 text-center text-[11px] font-medium py-1.5 border-y focus:outline-none"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
            }}
            min={SIZE_MIN}
            max={SIZE_MAX}
          />
          <button
            type="button"
            onClick={() => handleSizeChange(1)}
            className="p-1.5 rounded-r-md border border-l-0 transition-fast hover:bg-pink-500/10 hover:text-pink-400"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Plus size={12} />
          </button>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded-md text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
            style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
          >
            Font Size (px)
          </div>
        </div>
        {insertButtons.map(renderButton)}
      </div>
    ),
    handleKeyDown,
    applyAction,
  };
}
