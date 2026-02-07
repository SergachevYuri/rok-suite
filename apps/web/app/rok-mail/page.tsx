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
} from 'lucide-react';
import { RokMailToolbar } from '@/components/rok-mail/RokMailToolbar';
import { RokMailPreview } from '@/components/rok-mail/RokMailPreview';
import { CharCounter } from '@/components/rok-mail/CharCounter';
import { ColorPicker } from '@/components/rok-mail/ColorPicker';
import { GradientPicker, generateGradientMarkup } from '@/components/rok-mail/GradientPicker';
import { SymbolPicker } from '@/components/rok-mail/SymbolPicker';
import { TemplateSelector } from '@/components/rok-mail/TemplateSelector';
import { AiAssistant } from '@/components/rok-mail/AiAssistant';

type EditorMode = 'edit' | 'split' | 'preview';

export default function RokMailPage() {
  const [content, setContent] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('split');
  const [copied, setCopied] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showGradientPicker, setShowGradientPicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { toolbar, handleKeyDown, applyAction } = RokMailToolbar({
    textareaRef,
    content,
    onContentChange: setContent,
    onColorClick: () => { setShowColorPicker(!showColorPicker); setShowGradientPicker(false); },
    onGradientClick: () => { setShowGradientPicker(!showGradientPicker); setShowColorPicker(false); },
    onSymbolClick: () => { setShowSymbolPicker(!showSymbolPicker); },
  });

  const handleColorSelect = useCallback(
    (color: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.slice(start, end);
      const before = `<color="${color}">`;
      const after = '</color>';
      const newText = content.slice(0, start) + before + selected + after + content.slice(end);
      setContent(newText);
      const cursorPos = selected
        ? start + before.length + selected.length + after.length
        : start + before.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [content]
  );

  const handleGradientApply = useCallback(
    (startColor: string, endColor: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start === end) return; // need selected text
      const selected = content.slice(start, end);
      const gradientMarkup = generateGradientMarkup(selected, startColor, endColor);
      const newText = content.slice(0, start) + gradientMarkup + content.slice(end);
      setContent(newText);
      const cursorPos = start + gradientMarkup.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [content]
  );

  const handleSymbolSelect = useCallback(
    (symbol: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = content.slice(0, start) + symbol + content.slice(end);
      setContent(newText);
      const cursorPos = start + symbol.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [content]
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
    setContent(templateContent);
    setShowTemplates(false);
  }, []);

  const handleAiInsert = useCallback(
    (generatedContent: string) => {
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
              className="rounded-lg border overflow-hidden flex flex-col"
              style={{
                backgroundColor: 'var(--background-card)',
                borderColor: 'var(--border)',
              }}
            >
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
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your mail here... Use the toolbar to add formatting.&#10;&#10;Supported tags:&#10;<b>bold text</b>&#10;<i>italic text</i>&#10;<color=&quot;red&quot;>colored text</color>"
                className="flex-1 w-full p-4 resize-none font-mono text-sm focus:outline-none"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--foreground)',
                  minHeight: '400px',
                }}
                spellCheck={false}
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
