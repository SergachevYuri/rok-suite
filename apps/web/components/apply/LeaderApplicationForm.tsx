'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Camera, X, Plus, Trash2, Send, CheckCircle2, AlertCircle, Swords, Shield } from 'lucide-react';
import {
  submitLeaderApplication,
  type LeaderRoleInput,
  type UnitType,
  type RoleType,
} from '@/lib/supabase/use-leader-applications';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface RoleEntry extends LeaderRoleInput {
  uid: string;
  primaryPreview: string | null;
  secondaryPreview: string | null;
}

function newRole(): RoleEntry {
  return {
    uid: crypto.randomUUID(),
    unitType: 'infantry',
    roleType: 'rally',
    primaryFile: null,
    secondaryFile: null,
    primaryPreview: null,
    secondaryPreview: null,
  };
}

export function LeaderApplicationForm() {
  const t = useTranslations('apply');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [kingdom, setKingdom] = useState('');
  const [name, setName] = useState('');
  const [govId, setGovId] = useState('');
  const [discord, setDiscord] = useState('');
  const [notes, setNotes] = useState('');
  const [roles, setRoles] = useState<RoleEntry[]>([newRole()]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateRole = (uid: string, patch: Partial<RoleEntry>) => {
    setRoles((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const addRole = () => setRoles((prev) => [...prev, newRole()]);

  const removeRole = (uid: string) => {
    setRoles((prev) => {
      const target = prev.find((r) => r.uid === uid);
      if (target?.primaryPreview) URL.revokeObjectURL(target.primaryPreview);
      if (target?.secondaryPreview) URL.revokeObjectURL(target.secondaryPreview);
      return prev.filter((r) => r.uid !== uid);
    });
  };

  const handleFile = (
    uid: string,
    slot: 'primary' | 'secondary',
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((p) => ({ ...p, [`${uid}_${slot}`]: t('errors.imageTooLarge') }));
      return;
    }
    const url = URL.createObjectURL(file);
    if (slot === 'primary') {
      updateRole(uid, { primaryFile: file, primaryPreview: url });
    } else {
      updateRole(uid, { secondaryFile: file, secondaryPreview: url });
    }
    setErrors((p) => {
      const copy = { ...p };
      delete copy[`${uid}_${slot}`];
      return copy;
    });
  };

  const removeFile = (uid: string, slot: 'primary' | 'secondary') => {
    const role = roles.find((r) => r.uid === uid);
    if (!role) return;
    if (slot === 'primary') {
      if (role.primaryPreview) URL.revokeObjectURL(role.primaryPreview);
      updateRole(uid, { primaryFile: null, primaryPreview: null });
    } else {
      if (role.secondaryPreview) URL.revokeObjectURL(role.secondaryPreview);
      updateRole(uid, { secondaryFile: null, secondaryPreview: null });
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!kingdom.trim()) next.kingdom = t('errors.required');
    if (!name.trim()) next.name = t('errors.required');
    if (!govId.trim()) next.govId = t('errors.required');
    else if (!/^\d+$/.test(govId.trim())) next.govId = t('errors.govIdNumeric');

    roles.forEach((r) => {
      if (!r.primaryFile) next[`${r.uid}_primary`] = t('errors.uploadRequired');
      if (!r.secondaryFile) next[`${r.uid}_secondary`] = t('errors.uploadRequired');
    });

    if (roles.length === 0) next.roles = t('errors.atLeastOneRole');

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    const result = await submitLeaderApplication({
      kingdom,
      name,
      govId,
      discord,
      notes,
      locale,
      roles: roles.map((r) => ({
        unitType: r.unitType,
        roleType: r.roleType,
        primaryFile: r.primaryFile,
        secondaryFile: r.secondaryFile,
      })),
    });
    setSubmitting(false);

    if ('error' in result) {
      setSubmitError(result.error);
      return;
    }

    roles.forEach((r) => {
      if (r.primaryPreview) URL.revokeObjectURL(r.primaryPreview);
      if (r.secondaryPreview) URL.revokeObjectURL(r.secondaryPreview);
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-6 sm:p-8 text-center">
        <div className="inline-flex p-3 rounded-full bg-emerald-500/15 text-emerald-400 mb-4">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          {t('success.title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t('success.message')}
        </p>
      </div>
    );
  }

  const inputBase =
    'w-full rounded-lg border px-3 py-2.5 text-base sm:text-sm outline-none transition-colors focus:ring-2 focus:ring-[#4318ff]/40';
  const inputStyle = {
    backgroundColor: 'var(--background-secondary)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  };
  const errorBorder = 'border-red-500/60';

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Identity card */}
      <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {t('sections.identity')}
        </h2>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.kingdom')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={kingdom}
            onChange={(e) => setKingdom(e.target.value)}
            placeholder={t('placeholders.kingdom')}
            className={`${inputBase} ${errors.kingdom ? errorBorder : ''}`}
            style={inputStyle}
            autoComplete="off"
          />
          {errors.kingdom && <p className="text-xs text-red-400 mt-1">{errors.kingdom}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.name')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('placeholders.name')}
            className={`${inputBase} ${errors.name ? errorBorder : ''}`}
            style={inputStyle}
            autoComplete="off"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.govId')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={govId}
            onChange={(e) => setGovId(e.target.value)}
            placeholder={t('placeholders.govId')}
            className={`${inputBase} ${errors.govId ? errorBorder : ''}`}
            style={inputStyle}
            autoComplete="off"
          />
          {errors.govId && <p className="text-xs text-red-400 mt-1">{errors.govId}</p>}
        </div>
      </section>

      {/* Roles card */}
      <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              {t('sections.roles')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('sections.rolesHint')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {roles.map((role, idx) => (
            <RoleCard
              key={role.uid}
              index={idx}
              role={role}
              canRemove={roles.length > 1}
              onChangeUnit={(v) => updateRole(role.uid, { unitType: v })}
              onChangeRoleType={(v) => updateRole(role.uid, { roleType: v })}
              onFile={(slot, e) => handleFile(role.uid, slot, e)}
              onRemoveFile={(slot) => removeFile(role.uid, slot)}
              onRemove={() => removeRole(role.uid)}
              errorPrimary={errors[`${role.uid}_primary`]}
              errorSecondary={errors[`${role.uid}_secondary`]}
              t={t}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addRole}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('addRole')}
        </button>
      </section>

      {/* Optional card */}
      <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {t('sections.optional')}
        </h2>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.discord')}
          </label>
          <input
            type="text"
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder={t('placeholders.discord')}
            className={inputBase}
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.notes')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('placeholders.notes')}
            rows={3}
            className={inputBase}
            style={inputStyle}
          />
        </div>
      </section>

      {submitError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 bg-[var(--background)]/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-none border-t sm:border-0 border-[var(--border)]">
        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-[#4318ff] to-[#7c3aed] text-white font-medium text-sm shadow-lg shadow-[#4318ff]/20 hover:shadow-[#4318ff]/40 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {submitting ? tCommon('loading') : t('submit')}
        </button>
      </div>
    </form>
  );
}

interface RoleCardProps {
  index: number;
  role: RoleEntry;
  canRemove: boolean;
  onChangeUnit: (v: UnitType) => void;
  onChangeRoleType: (v: RoleType) => void;
  onFile: (slot: 'primary' | 'secondary', e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (slot: 'primary' | 'secondary') => void;
  onRemove: () => void;
  errorPrimary?: string;
  errorSecondary?: string;
  t: ReturnType<typeof useTranslations>;
}

function RoleCard({
  index,
  role,
  canRemove,
  onChangeUnit,
  onChangeRoleType,
  onFile,
  onRemoveFile,
  onRemove,
  errorPrimary,
  errorSecondary,
  t,
}: RoleCardProps) {
  const selectBase =
    'w-full rounded-lg border px-3 py-2.5 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[#4318ff]/40 appearance-none';
  const selectStyle = {
    backgroundColor: 'var(--background-secondary)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background-secondary)]/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {role.roleType === 'rally' ? (
            <Swords className="w-3.5 h-3.5" />
          ) : (
            <Shield className="w-3.5 h-3.5" />
          )}
          {t('roleNumber', { n: index + 1 })}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label={t('removeRole')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.unit')} <span className="text-red-400">*</span>
          </label>
          <select
            value={role.unitType}
            onChange={(e) => onChangeUnit(e.target.value as UnitType)}
            className={selectBase}
            style={selectStyle}
          >
            <option value="infantry">{t('units.infantry')}</option>
            <option value="archer">{t('units.archer')}</option>
            <option value="cavalry">{t('units.cavalry')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.role')} <span className="text-red-400">*</span>
          </label>
          <select
            value={role.roleType}
            onChange={(e) => onChangeRoleType(e.target.value as RoleType)}
            className={selectBase}
            style={selectStyle}
          >
            <option value="rally">{t('roleTypes.rally')}</option>
            <option value="garrison">{t('roleTypes.garrison')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScreenshotPicker
          label={t('fields.primaryCommander')}
          required
          preview={role.primaryPreview}
          error={errorPrimary}
          onChange={(e) => onFile('primary', e)}
          onRemove={() => onRemoveFile('primary')}
          uploadLabel={t('upload.tap')}
        />
        <ScreenshotPicker
          label={t('fields.secondaryCommander')}
          required
          preview={role.secondaryPreview}
          error={errorSecondary}
          onChange={(e) => onFile('secondary', e)}
          onRemove={() => onRemoveFile('secondary')}
          uploadLabel={t('upload.tap')}
        />
      </div>
    </div>
  );
}

interface ScreenshotPickerProps {
  label: string;
  required?: boolean;
  preview: string | null;
  error?: string;
  uploadLabel: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

function ScreenshotPicker({
  label,
  required,
  preview,
  error,
  uploadLabel,
  onChange,
  onRemove,
}: ScreenshotPickerProps) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={label}
            className="w-full h-40 sm:h-32 object-cover rounded-lg border border-[var(--border)]"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            aria-label="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center gap-1.5 w-full h-40 sm:h-32 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--background-secondary)] transition-colors ${
            error ? 'border-red-500/60' : 'border-[var(--border)]'
          }`}
        >
          <Camera className="w-5 h-5 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)] text-center px-2">{uploadLabel}</span>
          <input
            type="file"
            accept="image/*"
            onChange={onChange}
            className="hidden"
          />
        </label>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
