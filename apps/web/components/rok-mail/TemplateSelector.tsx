'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  MAIL_TEMPLATES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/rok-mail/templates';
import { RokMailPreview } from './RokMailPreview';

interface TemplateSelectorProps {
  onClose: () => void;
  onLoadTemplate: (content: string) => void;
}

export function TemplateSelector({ onClose, onLoadTemplate }: TemplateSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('angmar');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const categories = Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[];
  const filteredTemplates = MAIL_TEMPLATES.filter((t) => t.category === activeCategory);
  const previewTemplate = selectedTemplate
    ? MAIL_TEMPLATES.find((t) => t.id === selectedTemplate)
    : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-xl shadow-2xl border w-[90vw] max-w-3xl max-h-[80vh] flex flex-col"
        style={{
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            Mail Templates
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-pink-500/10 transition-fast"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Tabs */}
        <div
          className="flex flex-wrap gap-1 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setActiveCategory(cat);
                setSelectedTemplate(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-fast ${
                activeCategory === cat
                  ? 'bg-pink-500/20 text-pink-400 font-medium'
                  : 'hover:bg-pink-500/10'
              }`}
              style={activeCategory !== cat ? { color: 'var(--text-secondary)' } : undefined}
            >
              {TEMPLATE_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Template List */}
          <div
            className="md:w-1/3 border-b md:border-b-0 md:border-r overflow-y-auto p-2 shrink-0 max-h-[25vh] md:max-h-none"
            style={{ borderColor: 'var(--border)' }}
          >
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template.id)}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-fast ${
                  selectedTemplate === template.id
                    ? 'bg-pink-500/15 border border-pink-500/30'
                    : 'hover:bg-pink-500/5 border border-transparent'
                }`}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  {template.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {template.description}
                </p>
              </button>
            ))}
          </div>

          {/* Preview + Button */}
          <div className="flex-1 flex flex-col min-h-0">
            {previewTemplate ? (
              <>
                {/* Scrollable preview area */}
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <RokMailPreview content={previewTemplate.content} />
                  </div>
                </div>
                {/* Button pinned at bottom */}
                <div className="shrink-0 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => onLoadTemplate(previewTemplate.content)}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:opacity-90 transition-fast"
                  >
                    Load Template
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Select a template to preview
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
