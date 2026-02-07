'use client';

import { useState } from 'react';
import { X, Wand2, Loader2 } from 'lucide-react';
import { RokMailPreview } from './RokMailPreview';

interface AiAssistantProps {
  currentContent: string;
  onClose: () => void;
  onInsert: (content: string) => void;
  onReplace: (content: string) => void;
}

const QUICK_ACTIONS = [
  { label: 'Improve Draft', prompt: 'Improve my current draft. Make it more visually appealing with better formatting, headers, and symbols while keeping the same content.' },
  { label: 'Make Shorter', prompt: 'Make my current draft shorter and more concise while keeping the key information and formatting.' },
  { label: 'Add Formatting', prompt: 'Add bold, color, and decorative formatting to my current draft to make it look more professional.' },
  { label: 'More Formal', prompt: 'Rewrite my current draft in a more formal and official tone suitable for a kingdom-wide announcement.' },
];

export function AiAssistant({ currentContent, onClose, onInsert, onReplace }: AiAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function generate(userPrompt: string) {
    setGenerating(true);
    setError('');
    setResult('');

    try {
      const response = await fetch('/api/rok-mail/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          currentContent: currentContent || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Generation failed. Please try again.');
        return;
      }

      setResult(data.content);
    } catch {
      setError('Failed to connect. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim()) {
      generate(prompt.trim());
    }
  }

  function handleQuickAction(actionPrompt: string) {
    setPrompt(actionPrompt);
    generate(actionPrompt);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 shadow-2xl border-l flex flex-col"
        style={{
          backgroundColor: 'var(--background)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-pink-400" />
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              AI Writing Assistant
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-pink-500/10 transition-fast"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Actions */}
          {currentContent && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Quick Actions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action.prompt)}
                    disabled={generating}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-fast hover:bg-pink-500/10 disabled:opacity-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Input */}
          <form onSubmit={handleSubmit}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Describe the mail you want
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Write a KvK rally call for an attack on Zone 4 at 12:00 UTC..."
              className="w-full p-3 rounded-lg text-sm resize-none focus:outline-none border focus:border-pink-500/50"
              style={{
                backgroundColor: 'var(--background-secondary)',
                color: 'var(--foreground)',
                borderColor: 'var(--border)',
              }}
              rows={3}
            />
            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="mt-2 w-full py-2.5 rounded-lg text-sm font-medium transition-fast disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:opacity-90"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  Generate
                </>
              )}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Generated Mail
              </p>
              <div className="rounded-lg overflow-hidden border mb-3" style={{ borderColor: 'var(--border)' }}>
                <RokMailPreview content={result} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onReplace(result)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:opacity-90 transition-fast"
                >
                  Use This
                </button>
                <button
                  type="button"
                  onClick={() => onInsert(result)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-fast hover:bg-pink-500/10"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Insert at Cursor
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
