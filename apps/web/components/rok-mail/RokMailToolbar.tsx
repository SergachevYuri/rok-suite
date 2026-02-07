'use client';

import { Bold, Italic, Palette, Minus, Sparkles, Eraser } from 'lucide-react';

interface RokMailToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (content: string) => void;
  onColorClick: () => void;
  onSymbolClick: () => void;
}

type ToolbarAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'insert'; text: string }
  | { type: 'custom'; handler: () => void };

interface ToolbarButton {
  icon: React.ReactNode;
  label: string;
  action: ToolbarAction;
}

export function RokMailToolbar({
  textareaRef,
  content,
  onContentChange,
  onColorClick,
  onSymbolClick,
}: RokMailToolbarProps) {
  function applyAction(action: ToolbarAction) {
    if (action.type === 'custom') {
      action.handler();
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);

    if (action.type === 'wrap') {
      const newText =
        content.slice(0, start) +
        action.before +
        selected +
        action.after +
        content.slice(end);
      onContentChange(newText);
      const cursorPos = selected
        ? start + action.before.length + selected.length + action.after.length
        : start + action.before.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    } else if (action.type === 'insert') {
      const newText =
        content.slice(0, start) + action.text + content.slice(end);
      onContentChange(newText);
      const cursorPos = start + action.text.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    }
  }

  const buttons: ToolbarButton[] = [
    {
      icon: <Bold size={16} />,
      label: 'Bold',
      action: { type: 'wrap', before: '<b>', after: '</b>' },
    },
    {
      icon: <Italic size={16} />,
      label: 'Italic',
      action: { type: 'wrap', before: '<i>', after: '</i>' },
    },
    {
      icon: <Palette size={16} />,
      label: 'Color',
      action: { type: 'custom', handler: onColorClick },
    },
    {
      icon: <Minus size={16} />,
      label: 'Divider',
      action: { type: 'insert', text: '━━━━━━━━━━━━━━━━━━━━' },
    },
    {
      icon: <Sparkles size={16} />,
      label: 'Symbols',
      action: { type: 'custom', handler: onSymbolClick },
    },
    {
      icon: <Eraser size={16} />,
      label: 'Clear',
      action: { type: 'custom', handler: () => clearFormatting() },
    },
  ];

  function clearFormatting() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) return; // nothing selected

    const selected = content.slice(start, end);
    const stripped = selected
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<color=["'][^"']*["']>/gi, '')
      .replace(/<\/color>/gi, '');

    const newText = content.slice(0, start) + stripped + content.slice(end);
    onContentChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + stripped.length);
    }, 0);
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
      <div className="flex items-center gap-1 p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {buttons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => applyAction(btn.action)}
            className="p-2 rounded-md transition-fast hover:bg-pink-500/10 hover:text-pink-400"
            style={{ color: 'var(--text-secondary)' }}
            title={btn.label}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    ),
    handleKeyDown,
    applyAction,
  };
}
