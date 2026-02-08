'use client';

import { useState, useRef, useCallback } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import {
  ScrollText,
  Copy,
  Check,
  LayoutTemplate,
  Bot,
  Code,
  Eye,
  Columns2,
  Type,
} from 'lucide-react';
import { RokMailToolbar } from '@/components/rok-mail/RokMailToolbar';
import { RokMailPreview } from '@/components/rok-mail/RokMailPreview';
import { CharCounter } from '@/components/rok-mail/CharCounter';
import { ColorPicker } from '@/components/rok-mail/ColorPicker';
import { GradientPicker, generateGradientMarkup } from '@/components/rok-mail/GradientPicker';
import { SymbolPicker } from '@/components/rok-mail/SymbolPicker';
import { SizePicker } from '@/components/rok-mail/SizePicker';
import { TemplateSelector } from '@/components/rok-mail/TemplateSelector';
import { AiAssistant } from '@/components/rok-mail/AiAssistant';
import { stripRokMarkup, stripWithPositions, applyTextEdit } from '@/lib/rok-mail/parser';

type EditorMode = 'edit' | 'split' | 'preview';

export default function RokMailPage() {
  const [content, setContent] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('split');
  const [copied, setCopied] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showGradientPicker, setShowGradientPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [editTab, setEditTab] = useState<'source' | 'text'>('source');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Undo/redo history
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef(content);
  contentRef.current = content;

  function pushUndo(before: string) {
    const last = historyRef.current[historyRef.current.length - 1];
    if (before !== last) {
      historyRef.current.push(before);
      if (historyRef.current.length > 100) historyRef.current.shift();
    }
    redoRef.current = [];
  }

  function saveSnapshot() {
    pushUndo(contentRef.current);
    isTypingRef.current = false;
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = undefined;
    }
  }

  function handleUndo() {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    redoRef.current.push(contentRef.current);
    setContent(prev);
    isTypingRef.current = false;
  }

  function handleRedo() {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current.pop()!;
    historyRef.current.push(contentRef.current);
    setContent(next);
  }

  const canUndo = historyRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;

  const { toolbar, handleKeyDown, applyAction } = RokMailToolbar({
    textareaRef,
    content,
    onContentChange: setContent,
    onColorClick: () => { setShowColorPicker(!showColorPicker); setShowGradientPicker(false); setShowSizePicker(false); },
    onGradientClick: () => { setShowGradientPicker(!showGradientPicker); setShowColorPicker(false); setShowSizePicker(false); },
    onSymbolClick: () => { setShowSymbolPicker(!showSymbolPicker); },
    onSizeClick: () => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); setShowGradientPicker(false); },
    editMode: editTab,
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo,
    canRedo,
    onSaveSnapshot: saveSnapshot,
  });

  const handleColorSelect = useCallback(
    (color: string) => {
      applyAction({ type: 'wrap', before: `<color="${color}">`, after: '</color>' });
    },
    [applyAction]
  );

  const handleGradientApply = useCallback(
    (startColor: string, endColor: string) => {
      saveSnapshot();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const tStart = textarea.selectionStart;
      const tEnd = textarea.selectionEnd;
      if (tStart === tEnd) return; // need selected text

      if (editTab === 'text') {
        const { stripped, positions } = stripWithPositions(content);
        const selectedText = stripped.slice(tStart, tEnd);
        const gradientMarkup = generateGradientMarkup(selectedText, startColor, endColor);
        const mStart = tStart < positions.length ? positions[tStart] : content.length;
        const mEnd = tEnd > 0 && tEnd <= positions.length ? positions[tEnd - 1] + 1 : content.length;
        const newText = content.slice(0, mStart) + gradientMarkup + content.slice(mEnd);
        setContent(newText);
        // Stripped text unchanged (gradient wraps same chars), cursor at end
        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(tEnd, tEnd); }, 0);
      } else {
        const selected = content.slice(tStart, tEnd);
        const gradientMarkup = generateGradientMarkup(selected, startColor, endColor);
        const newText = content.slice(0, tStart) + gradientMarkup + content.slice(tEnd);
        setContent(newText);
        const cursorPos = tStart + gradientMarkup.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
      }
    },
    [content, editTab]
  );

  const handleSymbolSelect = useCallback(
    (symbol: string) => {
      saveSnapshot();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const tStart = textarea.selectionStart;
      const tEnd = textarea.selectionEnd;

      if (editTab === 'text') {
        const { positions } = stripWithPositions(content);
        const mPos = tStart > 0 && positions.length > 0
          ? positions[Math.min(tStart - 1, positions.length - 1)] + 1
          : positions.length > 0 ? positions[0] : content.length;
        const newText = content.slice(0, mPos) + symbol + content.slice(mPos);
        setContent(newText);
        const cursorPos = tStart + symbol.length;
        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(cursorPos, cursorPos); }, 0);
      } else {
        const newText = content.slice(0, tStart) + symbol + content.slice(tEnd);
        setContent(newText);
        const cursorPos = tStart + symbol.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(cursorPos, cursorPos);
        }, 0);
      }
    },
    [content, editTab]
  );

  const handleSizeSelect = useCallback(
    (size: string) => {
      applyAction({ type: 'wrap', before: `<size=${size}>`, after: '</size>' });
    },
    [applyAction]
  );

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTemplateLoad = useCallback((templateContent: string) => {
    saveSnapshot();
    setContent(templateContent);
    setShowTemplates(false);
  }, []);

  const handleAiInsert = useCallback(
    (generatedContent: string) => {
      saveSnapshot();
      const textarea = textareaRef.current;
      if (!textarea) {
        setContent(generatedContent);
        return;
      }
      const start = textarea.selectionStart;
      const newText = content.slice(0, start) + generatedContent + content.slice(start);
      setContent(newText);
      setShowAi(false);
    },
    [content]
  );

  const handleAiReplace = useCallback((generatedContent: string) => {
    saveSnapshot();
    setContent(generatedContent);
    setShowAi(false);
  }, []);

  const modes: { key: EditorMode; label: string; icon: typeof Code }[] = [
    { key: 'edit', label: 'Code', icon: Code },
    { key: 'split', label: 'Split', icon: Columns2 },
    { key: 'preview', label: 'Preview', icon: Eye },
  ];

  return (
    <AppSidebar>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-500 shadow-lg shadow-pink-500/25">
            <ScrollText size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              RoK Mail
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Format and preview in-game mail messages
            </p>
          </div>
        </div>

        {/* Top Bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-fast hover:bg-pink-500/10"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            <LayoutTemplate size={16} />
            Templates
          </button>
          <button
            type="button"
            onClick={() => setShowAi(!showAi)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-fast hover:bg-pink-500/10"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Bot size={16} />
            AI Assistant
          </button>

          <div className="flex-1" />

          {/* Mode Toggle */}
          <div
            className="flex items-center rounded-lg border p-0.5"
            style={{ borderColor: 'var(--border)' }}
          >
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isActive = editorMode === mode.key;
              // On mobile, hide the Split option
              const hideOnMobile = mode.key === 'split' ? 'hidden md:flex' : 'flex';
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setEditorMode(mode.key)}
                  className={`${hideOnMobile} items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-fast ${
                    isActive
                      ? 'bg-pink-500/20 text-pink-400 font-medium'
                      : 'hover:bg-pink-500/5'
                  }`}
                  style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                >
                  <Icon size={14} />
                  {mode.label}
                </button>
              );
            })}
          </div>

          <CharCounter content={content} />

          <button
            type="button"
            onClick={copyToClipboard}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-fast ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30'
            }`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Main Content */}
        <div
          className={`grid gap-4 ${
            editorMode === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'
          }`}
          style={{ minHeight: '500px' }}
        >
          {/* Editor Panel */}
          {(editorMode === 'edit' || editorMode === 'split') && (
            <div
              className="rounded-lg border flex flex-col"
              style={{
                backgroundColor: 'var(--background-card)',
                borderColor: 'var(--border)',
              }}
            >
              {/* Source / Text toggle */}
              <div className="flex items-center px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
                  {([
                    { key: 'source' as const, label: 'Source', icon: Code },
                    { key: 'text' as const, label: 'Text', icon: Type },
                  ]).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = editTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setEditTab(tab.key)}
                        className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-sm transition-fast ${
                          isActive
                            ? 'bg-pink-500/20 text-pink-400 font-medium'
                            : 'hover:bg-pink-500/5'
                        }`}
                        style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                      >
                        <Icon size={12} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {editTab === 'text' && content !== stripRokMarkup(content) && (
                  <p className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>
                    Formatting preserved
                  </p>
                )}
              </div>

              {/* Toolbar */}
              <div className="relative">
                {toolbar}
                <ColorPicker
                  isOpen={showColorPicker}
                  onClose={() => setShowColorPicker(false)}
                  onSelectColor={handleColorSelect}
                />
                <GradientPicker
                  isOpen={showGradientPicker}
                  onClose={() => setShowGradientPicker(false)}
                  onApplyGradient={handleGradientApply}
                />
                <SymbolPicker
                  isOpen={showSymbolPicker}
                  onClose={() => setShowSymbolPicker(false)}
                  onSelectSymbol={handleSymbolSelect}
                />
                <SizePicker
                  isOpen={showSizePicker}
                  onClose={() => setShowSizePicker(false)}
                  onSelectSize={handleSizeSelect}
                />
              </div>

              <textarea
                ref={textareaRef}
                value={editTab === 'source' ? content : stripRokMarkup(content)}
                onChange={(e) => {
                  // Save undo snapshot at the start of each typing batch
                  if (!isTypingRef.current) {
                    pushUndo(content);
                    isTypingRef.current = true;
                  }
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                  typingTimerRef.current = setTimeout(() => { isTypingRef.current = false; }, 2000);

                  if (editTab === 'source') {
                    setContent(e.target.value);
                  } else {
                    setContent(applyTextEdit(content, e.target.value));
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  editTab === 'source'
                    ? "Type your mail here... Use the toolbar to add formatting.\n\nSupported tags:\n<b>bold text</b>\n<i>italic text</i>\n<color=\"red\">colored text</color>"
                    : "Type your message here...\nFormatting tags are preserved automatically."
                }
                className={`flex-1 w-full p-4 resize-none text-sm focus:outline-none ${
                  editTab === 'source' ? 'font-mono' : ''
                }`}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--foreground)',
                  minHeight: '400px',
                }}
                spellCheck={editTab === 'text'}
              />
            </div>
          )}

          {/* Preview Panel */}
          {(editorMode === 'preview' || editorMode === 'split') && (
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              <RokMailPreview content={content} />
            </div>
          )}
        </div>
      </div>

      {/* Template Selector Modal */}
      {showTemplates && (
        <TemplateSelector
          onClose={() => setShowTemplates(false)}
          onLoadTemplate={handleTemplateLoad}
        />
      )}

      {/* AI Assistant Panel */}
      {showAi && (
        <AiAssistant
          currentContent={content}
          onClose={() => setShowAi(false)}
          onInsert={handleAiInsert}
          onReplace={handleAiReplace}
        />
      )}
    </AppSidebar>
  );
}
