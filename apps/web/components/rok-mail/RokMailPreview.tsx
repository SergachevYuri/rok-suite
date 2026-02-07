'use client';

import { renderRokMarkup } from '@/lib/rok-mail/parser';

interface RokMailPreviewProps {
  content: string;
}

export function RokMailPreview({ content }: RokMailPreviewProps) {
  const rendered = content ? renderRokMarkup(content) : null;

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-3 py-2 text-xs font-medium border-b"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
      >
        In-Game Mail Preview
      </div>
      <div
        className="flex-1 p-4 overflow-y-auto rounded-b-lg"
        style={{
          backgroundColor: '#1a1a2e',
          minHeight: '300px',
        }}
      >
        {rendered ? (
          <div className="text-sm leading-relaxed text-white/90 break-words whitespace-pre-wrap">
            {rendered}
          </div>
        ) : (
          <p className="text-sm text-white/30 italic">
            Your formatted mail will appear here...
          </p>
        )}
      </div>
    </div>
  );
}
