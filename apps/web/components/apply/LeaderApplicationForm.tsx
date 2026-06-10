'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Camera, X, Plus, Trash2, Send, CheckCircle2, AlertCircle,
  Swords, Shield, Info, HelpCircle,
} from 'lucide-react';
import {
  submitLeaderApplication,
  type LeaderRoleInput,
  type UnitType,
  type RoleType,
} from '@/lib/supabase/use-leader-applications';
import {
  useAvailableSeedKingdoms,
  useSeedDates,
  useSeedPlayers,
} from '@/lib/supabase/use-kingdom-seeds';
import { CommanderPicker } from './CommanderPicker';
import { Combobox, type ComboboxSuggestion } from './Combobox';

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}

function formatScanDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ShotSlot =
  | 'primaryGear'
  | 'primaryArmaments'
  | 'secondaryGear'
  | 'secondaryArmaments';

const SHOT_SLOTS: ShotSlot[] = [
  'primaryGear',
  'primaryArmaments',
  'secondaryGear',
  'secondaryArmaments',
];

const SLOT_TO_FILE_KEY: Record<ShotSlot, keyof LeaderRoleInput> = {
  primaryGear: 'primaryGearFile',
  primaryArmaments: 'primaryArmamentsFile',
  secondaryGear: 'secondaryGearFile',
  secondaryArmaments: 'secondaryArmamentsFile',
};

interface RoleEntry extends LeaderRoleInput {
  uid: string;
  previews: Record<ShotSlot, string | null>;
}

function newRole(): RoleEntry {
  return {
    uid: crypto.randomUUID(),
    unitType: 'infantry',
    roleType: 'rally',
    primaryCommanderId: null,
    primaryCommanderName: null,
    secondaryCommanderId: null,
    secondaryCommanderName: null,
    primaryGearFile: null,
    primaryArmamentsFile: null,
    secondaryGearFile: null,
    secondaryArmamentsFile: null,
    previews: {
      primaryGear: null,
      primaryArmaments: null,
      secondaryGear: null,
      secondaryArmaments: null,
    },
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

  // Autofill data sources
  const { kingdoms: availableKingdoms, loading: kingdomsLoading } = useAvailableSeedKingdoms();
  const kingdomNum = /^\d+$/.test(kingdom.trim()) ? Number(kingdom.trim()) : null;
  const kingdomKnown = kingdomNum !== null && availableKingdoms.includes(kingdomNum);
  const { dates: scanDates } = useSeedDates(kingdomKnown ? kingdomNum : null);
  const latestScanDate = scanDates[0] ?? null;
  const { players, loading: playersLoading } = useSeedPlayers(
    kingdomKnown ? kingdomNum : null,
    latestScanDate,
  );

  const kingdomSuggestions = useMemo<ComboboxSuggestion[]>(
    () => availableKingdoms.map((k) => ({ key: String(k), label: String(k), secondary: `KD ${k}` })),
    [availableKingdoms],
  );

  const playerSuggestions = useMemo<ComboboxSuggestion[]>(
    () =>
      players.map((p) => ({
        key: String(p.player_id),
        label: p.name,
        secondary: `ID ${p.player_id} · ${formatPower(p.power)}`,
      })),
    [players],
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const registerField = (key: string) => (el: HTMLElement | null) => {
    fieldRefs.current[key] = el;
  };
  const scrollToFirstError = (errorMap: Record<string, string>) => {
    const firstKey = Object.keys(errorMap)[0];
    if (!firstKey) return;
    const el = fieldRefs.current[firstKey];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const updateRole = (uid: string, patch: Partial<RoleEntry>) => {
    setRoles((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const addRole = () => setRoles((prev) => [...prev, newRole()]);

  const removeRole = (uid: string) => {
    setRoles((prev) => {
      const target = prev.find((r) => r.uid === uid);
      if (target) {
        SHOT_SLOTS.forEach((slot) => {
          const url = target.previews[slot];
          if (url) URL.revokeObjectURL(url);
        });
      }
      return prev.filter((r) => r.uid !== uid);
    });
  };

  const handleFile = (
    uid: string,
    slot: ShotSlot,
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
    setRoles((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const old = r.previews[slot];
        if (old) URL.revokeObjectURL(old);
        return {
          ...r,
          [SLOT_TO_FILE_KEY[slot]]: file,
          previews: { ...r.previews, [slot]: url },
        };
      }),
    );
    setErrors((p) => {
      const copy = { ...p };
      delete copy[`${uid}_${slot}`];
      return copy;
    });
  };

  const removeFile = (uid: string, slot: ShotSlot) => {
    setRoles((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const old = r.previews[slot];
        if (old) URL.revokeObjectURL(old);
        return {
          ...r,
          [SLOT_TO_FILE_KEY[slot]]: null,
          previews: { ...r.previews, [slot]: null },
        };
      }),
    );
  };

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!kingdom.trim()) next.kingdom = t('errors.required');
    if (!name.trim()) next.name = t('errors.required');
    if (!govId.trim()) next.govId = t('errors.required');
    else if (!/^\d+$/.test(govId.trim())) next.govId = t('errors.govIdNumeric');

    roles.forEach((r) => {
      if (!r.primaryCommanderId) next[`${r.uid}_primaryCommander`] = t('errors.commanderRequired');
      if (!r.secondaryCommanderId) next[`${r.uid}_secondaryCommander`] = t('errors.commanderRequired');
      if (r.primaryCommanderId && r.primaryCommanderId === r.secondaryCommanderId) {
        next[`${r.uid}_secondaryCommander`] = t('errors.commanderDuplicate');
      }
    });

    if (roles.length === 0) next.roles = t('errors.atLeastOneRole');

    setErrors(next);
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs);
      return;
    }

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
        primaryCommanderId: r.primaryCommanderId,
        primaryCommanderName: r.primaryCommanderName,
        secondaryCommanderId: r.secondaryCommanderId,
        secondaryCommanderName: r.secondaryCommanderName,
        primaryGearFile: r.primaryGearFile,
        primaryArmamentsFile: r.primaryArmamentsFile,
        secondaryGearFile: r.secondaryGearFile,
        secondaryArmamentsFile: r.secondaryArmamentsFile,
      })),
    });
    setSubmitting(false);

    if ('error' in result) {
      setSubmitError(result.error);
      return;
    }

    roles.forEach((r) => {
      SHOT_SLOTS.forEach((slot) => {
        const url = r.previews[slot];
        if (url) URL.revokeObjectURL(url);
      });
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
    <form onSubmit={handleSubmit} className="space-y-6 pb-32 sm:pb-6" noValidate>
      {/* What you'll need — short orientation for first-time visitors */}
      <section className="rounded-2xl bg-[#4318ff]/5 border border-[#4318ff]/20 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-[#4318ff]/10 text-[#a78bfa] flex-shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1.5">
              {t('intro.title')}
            </h2>
            <ul className="space-y-1 text-xs text-[var(--text-secondary)] leading-relaxed">
              <li>• {t('intro.step1')}</li>
              <li>• {t('intro.step2')}</li>
              <li>• {t('intro.step3')}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Identity card */}
      <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {t('sections.identity')}
        </h2>

        <div ref={registerField('kingdom')}>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.kingdom')} <span className="text-red-400">*</span>
          </label>
          <Combobox
            value={kingdom}
            onChange={setKingdom}
            suggestions={kingdomSuggestions}
            placeholder={t('placeholders.kingdom')}
            invalid={!!errors.kingdom}
            inputMode="numeric"
            emptyHint={t('autofill.kingdomNotFound')}
            loading={kingdomsLoading && availableKingdoms.length === 0}
            loadingHint={t('autofill.loading')}
          />
          {errors.kingdom && <p className="text-xs text-red-400 mt-1">{errors.kingdom}</p>}
        </div>

        <div ref={registerField('name')}>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.name')} <span className="text-red-400">*</span>
          </label>
          <Combobox
            value={name}
            onChange={setName}
            onPick={(s) => {
              setName(s.label);
              setGovId(s.key);
            }}
            suggestions={kingdomKnown ? playerSuggestions : []}
            placeholder={t('placeholders.name')}
            invalid={!!errors.name}
            loading={kingdomKnown && playersLoading && players.length === 0}
            loadingHint={t('autofill.loading')}
            emptyHint={
              kingdomKnown
                ? t('autofill.noPlayers')
                : t('autofill.pickKingdomFirst')
            }
          />
          {kingdomKnown && latestScanDate && (
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {t('autofill.scanLabel', { date: formatScanDate(latestScanDate, locale) })}
            </p>
          )}
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div ref={registerField('govId')}>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
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
          <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)] mt-1.5 leading-snug">
            <HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{t('hints.govIdLocation')}</span>
          </p>
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
              onChangeUnit={(v) =>
                updateRole(role.uid, {
                  unitType: v,
                  // Clear commanders so a Cavalry commander isn't left selected when
                  // the user switches the role to Infantry — that mismatch would
                  // silently submit bad data.
                  primaryCommanderId: null,
                  primaryCommanderName: null,
                  secondaryCommanderId: null,
                  secondaryCommanderName: null,
                })
              }
              onChangeRoleType={(v) =>
                updateRole(role.uid, {
                  roleType: v,
                  // Garrison and rally draw from different commander pools, so
                  // clear any selection to avoid silently submitting a commander
                  // that isn't valid for the newly chosen role.
                  primaryCommanderId: null,
                  primaryCommanderName: null,
                  secondaryCommanderId: null,
                  secondaryCommanderName: null,
                })
              }
              onChangeCommander={(slot, id, name) =>
                updateRole(
                  role.uid,
                  slot === 'primary'
                    ? { primaryCommanderId: id, primaryCommanderName: name }
                    : { secondaryCommanderId: id, secondaryCommanderName: name },
                )
              }
              onFile={(slot, e) => handleFile(role.uid, slot, e)}
              onRemoveFile={(slot) => removeFile(role.uid, slot)}
              onRemove={() => removeRole(role.uid)}
              errorPrimaryCommander={errors[`${role.uid}_primaryCommander`]}
              errorSecondaryCommander={errors[`${role.uid}_secondaryCommander`]}
              fileErrors={{
                primaryGear: errors[`${role.uid}_primaryGear`],
                primaryArmaments: errors[`${role.uid}_primaryArmaments`],
                secondaryGear: errors[`${role.uid}_secondaryGear`],
                secondaryArmaments: errors[`${role.uid}_secondaryArmaments`],
              }}
              registerCommanderField={(slot, el) => {
                fieldRefs.current[`${role.uid}_${slot}Commander`] = el;
              }}
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
            rows={4}
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
  onChangeCommander: (slot: 'primary' | 'secondary', id: string | null, name: string | null) => void;
  onFile: (slot: ShotSlot, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (slot: ShotSlot) => void;
  onRemove: () => void;
  errorPrimaryCommander?: string;
  errorSecondaryCommander?: string;
  fileErrors: Partial<Record<ShotSlot, string>>;
  registerCommanderField?: (slot: 'primary' | 'secondary', el: HTMLElement | null) => void;
  t: ReturnType<typeof useTranslations>;
}

function RoleCard({
  index,
  role,
  canRemove,
  onChangeUnit,
  onChangeRoleType,
  onChangeCommander,
  onFile,
  onRemoveFile,
  onRemove,
  errorPrimaryCommander,
  errorSecondaryCommander,
  fileErrors,
  registerCommanderField,
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
        <div ref={(el) => registerCommanderField?.('primary', el)}>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.primaryCommander')} <span className="text-red-400">*</span>
          </label>
          <CommanderPicker
            value={role.primaryCommanderId}
            onChange={(id, name) => onChangeCommander('primary', id, name)}
            unitFilter={role.unitType}
            garrisonOnly={role.roleType === 'garrison'}
            invalid={!!errorPrimaryCommander}
            placeholder={t('commander.placeholder')}
          />
          {errorPrimaryCommander && (
            <p className="text-xs text-red-400 mt-1">{errorPrimaryCommander}</p>
          )}
        </div>
        <div ref={(el) => registerCommanderField?.('secondary', el)}>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            {t('fields.secondaryCommander')} <span className="text-red-400">*</span>
          </label>
          <CommanderPicker
            value={role.secondaryCommanderId}
            onChange={(id, name) => onChangeCommander('secondary', id, name)}
            unitFilter={role.unitType}
            garrisonOnly={role.roleType === 'garrison'}
            invalid={!!errorSecondaryCommander}
            placeholder={t('commander.placeholder')}
          />
          {errorSecondaryCommander && (
            <p className="text-xs text-red-400 mt-1">{errorSecondaryCommander}</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
          {t('upload.sectionLabel')}
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-3">{t('upload.hint')}</p>

        <CommanderShots
          heading={t('upload.primaryCommander')}
          gearLabel={t('upload.gear')}
          armamentsLabel={t('upload.armaments')}
          gearPreview={role.previews.primaryGear}
          armamentsPreview={role.previews.primaryArmaments}
          gearError={fileErrors.primaryGear}
          armamentsError={fileErrors.primaryArmaments}
          onGearChange={(e) => onFile('primaryGear', e)}
          onArmamentsChange={(e) => onFile('primaryArmaments', e)}
          onGearRemove={() => onRemoveFile('primaryGear')}
          onArmamentsRemove={() => onRemoveFile('primaryArmaments')}
          tapLabel={t('upload.tap')}
        />

        <div className="h-3" />

        <CommanderShots
          heading={t('upload.secondaryCommander')}
          gearLabel={t('upload.gear')}
          armamentsLabel={t('upload.armaments')}
          gearPreview={role.previews.secondaryGear}
          armamentsPreview={role.previews.secondaryArmaments}
          gearError={fileErrors.secondaryGear}
          armamentsError={fileErrors.secondaryArmaments}
          onGearChange={(e) => onFile('secondaryGear', e)}
          onArmamentsChange={(e) => onFile('secondaryArmaments', e)}
          onGearRemove={() => onRemoveFile('secondaryGear')}
          onArmamentsRemove={() => onRemoveFile('secondaryArmaments')}
          tapLabel={t('upload.tap')}
        />
      </div>
    </div>
  );
}

interface CommanderShotsProps {
  heading: string;
  gearLabel: string;
  armamentsLabel: string;
  gearPreview: string | null;
  armamentsPreview: string | null;
  gearError?: string;
  armamentsError?: string;
  onGearChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onArmamentsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGearRemove: () => void;
  onArmamentsRemove: () => void;
  tapLabel: string;
}

function CommanderShots({
  heading,
  gearLabel,
  armamentsLabel,
  gearPreview,
  armamentsPreview,
  gearError,
  armamentsError,
  onGearChange,
  onArmamentsChange,
  onGearRemove,
  onArmamentsRemove,
  tapLabel,
}: CommanderShotsProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-card)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
        {heading}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ScreenshotPicker
          label={gearLabel}
          preview={gearPreview}
          error={gearError}
          onChange={onGearChange}
          onRemove={onGearRemove}
          uploadLabel={tapLabel}
        />
        <ScreenshotPicker
          label={armamentsLabel}
          preview={armamentsPreview}
          error={armamentsError}
          onChange={onArmamentsChange}
          onRemove={onArmamentsRemove}
          uploadLabel={tapLabel}
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
  const tCommon = useTranslations('common');
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
            className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            aria-label={tCommon('delete')}
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
