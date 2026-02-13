'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Share2,
  Link,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { RokMailToolbar } from '@/components/rok-mail/RokMailToolbar';
import { RokMailPreview } from '@/components/rok-mail/RokMailPreview';
import { CharCounter } from '@/components/rok-mail/CharCounter';
import { ColorPicker } from '@/components/rok-mail/ColorPicker';
import { GradientPicker, generateGradientMarkup } from '@/components/rok-mail/GradientPicker';
import { SymbolPicker } from '@/components/rok-mail/SymbolPicker';
import { TemplateSelector } from '@/components/rok-mail/TemplateSelector';
import { AiAssistant } from '@/components/rok-mail/AiAssistant';
import { MailParts } from '@/components/rok-mail/MailParts';
import { stripRokMarkup, stripWithPositions, applyTextEdit } from '@/lib/rok-mail/parser';
import { splitMailContent, hasManualBreaks } from '@/lib/rok-mail/splitter';
import { ALLIANCE_DESCRIPTIONS, ALLIANCE_KEYS, ALLIANCE_COLORS, type AllianceKey } from '@/lib/rok-mail/alliance-descriptions';

type EditorMode = 'edit' | 'split' | 'preview';

function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function RokMailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('split');
  const [copied, setCopied] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showGradientPicker, setShowGradientPicker] = useState(false);
  const [fontSize, setFontSize] = useState(30);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [editTab, setEditTab] = useState<'source' | 'text' | 'preview'>('source');
  const [shareId, setShareId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<'mail' | 'alliance'>('mail');
  const [selectedAlliance, setSelectedAlliance] = useState<AllianceKey>('ANG');
  const mailContentRef = useRef('');
  const [allianceContents, setAllianceContents] = useState<Record<AllianceKey, string>>({ ...ALLIANCE_DESCRIPTIONS });
  const contentModeRef = useRef<'mail' | 'alliance'>('mail');
  contentModeRef.current = contentMode;
  const selectedAllianceRef = useRef<AllianceKey>('ANG');
  selectedAllianceRef.current = selectedAlliance;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shareIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadedRef = useRef(false);

  const mailParts = useMemo(() => {
    if (content.length > 2000 || hasManualBreaks(content)) {
      const parts = splitMailContent(content);
      return parts.length > 1 ? parts : null;
    }
    return null;
  }, [content]);

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

  function clearUndoRedo() {
    historyRef.current = [];
    redoRef.current = [];
    isTypingRef.current = false;
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = undefined; }
  }

  function handleModeSwitch(mode: 'mail' | 'alliance') {
    if (mode === contentModeRef.current) return;
    if (contentModeRef.current === 'mail') {
      mailContentRef.current = contentRef.current;
      setContent(allianceContents[selectedAllianceRef.current]);
    } else {
      setAllianceContents(prev => ({ ...prev, [selectedAllianceRef.current]: contentRef.current }));
      setContent(mailContentRef.current);
    }
    clearUndoRedo();
    setContentMode(mode);
  }

  function handleAllianceSwitch(key: AllianceKey) {
    if (key === selectedAllianceRef.current) return;
    const updated = { ...allianceContents, [selectedAllianceRef.current]: contentRef.current };
    setAllianceContents(updated);
    setContent(updated[key]);
    clearUndoRedo();
    setSelectedAlliance(key);
  }

  function handleResetAlliance() {
    saveSnapshot();
    setContent(ALLIANCE_DESCRIPTIONS[selectedAllianceRef.current]);
    setAllianceContents(prev => ({ ...prev, [selectedAllianceRef.current]: ALLIANCE_DESCRIPTIONS[selectedAllianceRef.current] }));
  }

  // Load shared mail from URL or localStorage draft
  useEffect(() => {
    const mailId = searchParams.get('mail');
    if (mailId && !loadedRef.current) {
      loadedRef.current = true;
      shareIdRef.current = mailId;
      setShareId(mailId);
      (async () => {
        const { data } = await supabase
          .from('rok_mail')
          .select('content')
          .eq('share_id', mailId)
          .maybeSingle();
        if (data) setContent(data.content || '');
      })();
    } else if (!loadedRef.current) {
      const draft = localStorage.getItem('rok-mail-draft');
      if (draft) {
        loadedRef.current = true;
        setContent(draft);
        localStorage.removeItem('rok-mail-draft');
      }
    }
  }, [searchParams]);

  // Auto-save when content changes (debounced) — only in mail mode
  useEffect(() => {
    if (!shareIdRef.current || contentModeRef.current !== 'mail') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await supabase
        .from('rok_mail')
        .update({ content })
        .eq('share_id', shareIdRef.current);
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content]);

  async function handleShare() {
    setShareError(null);

    try {
      if (shareId) {
        const url = `${window.location.origin}/rok-mail?mail=${shareId}`;
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        return;
      }

      const newId = generateShareId();
      const { error } = await supabase
        .from('rok_mail')
        .insert([{ share_id: newId, content }]);

      if (error) {
        console.error('Failed to create share link:', error);
        setShareError('Failed to create share link. Is the database set up?');
        setTimeout(() => setShareError(null), 5000);
        return;
      }

      shareIdRef.current = newId;
      setShareId(newId);

      const url = `${window.location.origin}/rok-mail?mail=${newId}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard may fail after async gap — still show link
      }

      router.push(`/rok-mail?mail=${newId}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Share error:', err);
      setShareError('Something went wrong. Please try again.');
      setTimeout(() => setShareError(null), 5000);
    }
  }

  const { toolbar, handleKeyDown, applyAction } = RokMailToolbar({
    textareaRef,
    content,
    onContentChange: setContent,
    onColorClick: () => { setShowColorPicker(!showColorPicker); setShowGradientPicker(false); },
    onGradientClick: () => { setShowGradientPicker(!showGradientPicker); setShowColorPicker(false); },
    onSymbolClick: () => { setShowSymbolPicker(!showSymbolPicker); },
    fontSize,
    onFontSizeChange: setFontSize,
    editMode: editTab === 'preview' ? 'source' : editTab,
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
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 sm:pt-6 md:pt-8">
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-500 shadow-lg shadow-pink-500/25">
            <ScrollText size={20} className="text-white sm:hidden" />
            <ScrollText size={24} className="text-white hidden sm:block" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              RoK Mail
            </h1>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {contentMode === 'mail' ? 'Format and preview in-game mail messages' : 'Edit in-game alliance descriptions'}
            </p>
          </div>
        </div>
      </div>

      {/* Sticky Controls */}
      <div className="sticky top-14 lg:top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-1.5 sm:py-2">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            {/* Mode Tabs */}
            <div
              className="flex items-center rounded-lg border p-0.5 mr-1"
              style={{ borderColor: 'var(--border)' }}
            >
              {([
                { key: 'mail' as const, label: 'Mail' },
                { key: 'alliance' as const, label: 'Alliance' },
              ] as const).map((mode) => {
                const isActive = contentMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => handleModeSwitch(mode.key)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-fast ${
                      isActive
                        ? 'bg-pink-500/20 text-pink-400 font-medium'
                        : 'hover:bg-pink-500/5'
                    }`}
                    style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

          {contentMode === 'mail' ? (
            <>
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm transition-fast hover:bg-pink-500/10"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                title="Templates"
              >
                <LayoutTemplate size={16} />
                Templates
              </button>
              <button
                type="button"
                onClick={() => setShowAi(!showAi)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm transition-fast hover:bg-pink-500/10"
                style={{ color: 'var(--text-secondary)' }}
                title="AI Assistant"
              >
                <Bot size={16} />
                <span className="hidden sm:inline">AI Assistant</span>
              </button>
            </>
          ) : (
            <>
              {ALLIANCE_KEYS.map((key) => {
                const isActive = selectedAlliance === key;
                const color = ALLIANCE_COLORS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAllianceSwitch(key)}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg font-medium transition-fast ${
                      isActive ? 'shadow-lg' : 'hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: isActive ? `${color}20` : 'transparent',
                      color,
                      border: `2px solid ${color}${isActive ? '' : '40'}`,
                    }}
                  >
                    {key}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleResetAlliance}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm transition-fast hover:bg-pink-500/10"
                style={{ color: 'var(--text-secondary)' }}
                title="Reset to default template"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}

          <div className="flex-1" />

          {/* Mode Toggle — desktop only (mobile uses Source/Text/Preview tabs) */}
          <div
            className="hidden md:flex items-center rounded-lg border p-0.5"
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
                  className={`${hideOnMobile} items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs rounded-md transition-fast ${
                    isActive
                      ? 'bg-pink-500/20 text-pink-400 font-medium'
                      : 'hover:bg-pink-500/5'
                  }`}
                  style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block">
            <CharCounter content={content} partCount={mailParts?.length} />
          </div>

          <button
            type="button"
            onClick={copyToClipboard}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-fast ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30'
            }`}
            title={copied ? 'Copied!' : 'Copy markup'}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          {contentMode === 'mail' && (
            <button
              type="button"
              onClick={handleShare}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-fast ${
                linkCopied
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : shareId
                    ? 'bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30'
                    : 'hover:bg-pink-500/10'
              }`}
              style={!shareId && !linkCopied ? { color: 'var(--text-secondary)' } : undefined}
              title={linkCopied ? 'Link copied!' : shareId ? 'Copy share link' : 'Share'}
            >
              {linkCopied ? <Check size={16} /> : shareId ? <Link size={16} /> : <Share2 size={16} />}
              <span className="hidden sm:inline">{linkCopied ? 'Link copied!' : shareId ? 'Copy Link' : 'Share'}</span>
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-6 md:pb-8 pt-4">
        {shareError && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            {shareError}
          </div>
        )}

        {/* Main Content */}
        <div
          className={`grid gap-4 ${
            editorMode === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'
          }`}
          style={{ minHeight: '500px' }}
        >
          {/* Editor Panel — always visible on mobile, hidden on desktop in preview mode */}
          <div
            className={`rounded-lg border flex flex-col ${editorMode === 'preview' ? 'md:hidden' : ''}`}
            style={{
              backgroundColor: 'var(--background-card)',
              borderColor: 'var(--border)',
            }}
          >
              {/* Sticky editor header on mobile */}
              <div className="sticky top-[6.5rem] md:static z-20 rounded-t-lg" style={{ backgroundColor: 'var(--background-card)' }}>
                {/* Source / Text / Preview toggle */}
                <div className="flex items-center px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
                    {([
                      { key: 'source' as const, label: 'Source', icon: Code, hide: '' },
                      { key: 'text' as const, label: 'Text', icon: Type, hide: '' },
                      { key: 'preview' as const, label: 'Preview', icon: Eye, hide: 'md:hidden' },
                    ]).map((tab) => {
                      const Icon = tab.icon;
                      const isActive = editTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setEditTab(tab.key)}
                          className={`${tab.hide} flex items-center gap-1 px-2 py-1 text-[11px] rounded-sm transition-fast ${
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

                {/* Toolbar — hidden when viewing preview */}
                {editTab !== 'preview' && (
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
                )}
              </div>

              {/* Content: preview or editor */}
              {editTab === 'preview' ? (
                <div className="flex-1">
                  {mailParts && mailParts.length > 1 ? (
                    <MailParts parts={mailParts} />
                  ) : (
                    <RokMailPreview content={content} variant={contentMode === 'alliance' ? 'alliance' : 'mail'} />
                  )}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={editTab === 'source' ? content : stripRokMarkup(content)}
                  onChange={(e) => {
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
              )}
          </div>

          {/* Preview Panel — desktop only (mobile uses Preview tab in editor) */}
          {(editorMode === 'preview' || editorMode === 'split') && (
            <div className="hidden md:block">
              {mailParts && mailParts.length > 1 ? (
                <MailParts parts={mailParts} />
              ) : (
                <div
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <RokMailPreview content={content} variant={contentMode === 'alliance' ? 'alliance' : 'mail'} />
                </div>
              )}
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
