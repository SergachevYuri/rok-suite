'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Send, CheckCircle, Clock, XCircle, AlertCircle, Camera, X } from 'lucide-react';
import { MgeSkillInput } from './MgeSkillInput';
import { supabase } from '@/lib/supabase';
import { submitApplication, uploadMgeScreenshot, type MgeEvent, type MgeApplication, type MgeApplicationStatus } from '@/lib/supabase/use-mge';
import { formatSkillLevels, commanderInvestmentScore, isDeadlinePassed, formatDeadline } from '@/lib/mge/helpers';
import { allianceDisplay } from '@/lib/alliances';

interface RosterMember {
  id: string;
  name: string;
  alliance: string | null;
  power: number;
}

interface MgeApplyTabProps {
  event: MgeEvent;
  onApplicationSubmitted: () => void;
}

const APPLICANT_KEY = 'mge-applicant-name';

function ApplicationStatusCard({ app }: { app: MgeApplication }) {
  const statusConfig: Record<MgeApplicationStatus, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <Clock size={18} />, color: 'text-blue-400', label: 'Pending Review' },
    approved: { icon: <CheckCircle size={18} />, color: 'text-emerald-400', label: 'Approved' },
    waitlisted: { icon: <AlertCircle size={18} />, color: 'text-blue-400', label: 'Waitlisted' },
    declined: { icon: <XCircle size={18} />, color: 'text-red-400', label: 'Declined' },
    withdrawn: { icon: <XCircle size={18} />, color: 'text-zinc-400', label: 'Withdrawn' },
  };

  const config = statusConfig[app.status];

  return (
    <div className="p-4 rounded-lg border" style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className={config.color}>{config.icon}</span>
        <span className={`font-semibold ${config.color}`}>{config.label}</span>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-secondary)' }}>Commander</span>
          <span style={{ color: 'var(--foreground)' }}>{app.commander_name}</span>
        </div>
        {app.skill_levels && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Skills</span>
            <span style={{ color: 'var(--foreground)' }}>
              Lv.{app.commander_level} — {formatSkillLevels(app.skill_levels)} — {app.commander_stars}★
            </span>
          </div>
        )}
        {app.preferred_tier && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Preferred</span>
            <span style={{ color: 'var(--foreground)' }}>{app.preferred_tier}</span>
          </div>
        )}
        {app.assigned_tier && (
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Assigned Tier</span>
            <span className="text-blue-400 font-medium">{app.assigned_tier}</span>
          </div>
        )}
        {app.officer_notes && (
          <div className="mt-2 p-2 rounded-md text-xs" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}>
            <span className="font-medium">Officer Note:</span> {app.officer_notes}
          </div>
        )}
      </div>
    </div>
  );
}

export function MgeApplyTab({ event, onApplicationSubmitted }: MgeApplyTabProps) {
  // Applicant identity
  const [applicantName, setApplicantName] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [showNameDropdown, setShowNameDropdown] = useState(false);

  // Auto-filled from roster
  const [applicantAlliance, setApplicantAlliance] = useState('');
  const [applicantPower, setApplicantPower] = useState<number | null>(null);

  // Commander stats
  const focusCommander = event.mge_event_commanders.find(c => c.is_focus)?.commander_name
    || event.mge_event_commanders[0]?.commander_name
    || event.focused_commander.split(',')[0]?.trim()
    || '';
  const [level, setLevel] = useState(60);
  const [skills, setSkills] = useState([5, 5, 5, 5]);
  const [stars, setStars] = useState(5);

  // Tier preferences
  const [preferredTier, setPreferredTier] = useState('');
  const [maxTier, setMaxTier] = useState('');
  const [notes, setNotes] = useState('');

  // Screenshot
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // State
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existingApp, setExistingApp] = useState<MgeApplication | null>(null);

  // Load roster
  useEffect(() => {
    async function fetchRoster() {
      const { data } = await supabase
        .from('alliance_roster')
        .select('id, name, alliance, power')
        .eq('is_active', true)
        .order('power', { ascending: false });
      setRoster(data || []);
    }
    fetchRoster();
  }, []);

  // Load saved name
  useEffect(() => {
    const saved = localStorage.getItem(APPLICANT_KEY);
    if (saved) {
      setApplicantName(saved);
      // Check if they already applied
      const existing = event.mge_applications.find(
        a => a.applicant_name.toLowerCase() === saved.toLowerCase()
      );
      if (existing) setExistingApp(existing);
    }
  }, [event.mge_applications]);

  // Auto-fill alliance/power when name is selected
  useEffect(() => {
    if (applicantName) {
      const member = roster.find(m => m.name.toLowerCase() === applicantName.toLowerCase());
      if (member) {
        setApplicantAlliance(member.alliance || '');
        setApplicantPower(member.power);
      }
    }
  }, [applicantName, roster]);

  const filteredRoster = useMemo(() => {
    if (!nameSearch) return roster.slice(0, 15);
    const search = nameSearch.toLowerCase();
    return roster.filter(m => m.name.toLowerCase().includes(search)).slice(0, 15);
  }, [roster, nameSearch]);

  const deadlinePassed = isDeadlinePassed(event.application_deadline);

  const handleSelectName = (name: string) => {
    setApplicantName(name);
    setNameSearch('');
    setShowNameDropdown(false);
    localStorage.setItem(APPLICANT_KEY, name);

    // Check existing application
    const existing = event.mge_applications.find(
      a => a.applicant_name.toLowerCase() === name.toLowerCase()
    );
    if (existing) setExistingApp(existing);
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }
    setScreenshotFile(file);
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  };

  const handleSubmit = async () => {
    if (!applicantName.trim() || !focusCommander) return;
    setSubmitting(true);

    let screenshotUrl: string | null = null;
    if (screenshotFile) {
      screenshotUrl = await uploadMgeScreenshot(screenshotFile, event.id, applicantName.trim());
    }

    const result = await submitApplication(event.id, {
      applicant_name: applicantName.trim(),
      applicant_alliance: applicantAlliance || null,
      applicant_power: applicantPower,
      commander_name: focusCommander,
      commander_level: level,
      skill_levels: skills,
      commander_stars: stars,
      preferred_tier: preferredTier || null,
      max_tier: maxTier || null,
      notes: notes.trim() || null,
      screenshot_url: screenshotUrl,
    });

    if (result) {
      localStorage.setItem(APPLICANT_KEY, applicantName.trim());
      setExistingApp(result);
      onApplicationSubmitted();
    }
    setSubmitting(false);
  };

  const inputClass = 'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50';
  const inputStyle = { backgroundColor: 'var(--background-secondary)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  // If deadline passed and not already applied
  if (deadlinePassed && !existingApp) {
    return (
      <div className="p-6 text-center">
        <Clock size={32} className="mx-auto mb-3 text-zinc-500" />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Applications Closed</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          The deadline was {formatDeadline(event.application_deadline)}
        </p>
      </div>
    );
  }

  // If already applied, show status
  if (existingApp) {
    return (
      <div className="p-4">
        <ApplicationStatusCard app={existingApp} />
      </div>
    );
  }

  const tiers = event.mge_rank_tiers.length > 0
    ? event.mge_rank_tiers
    : [];

  return (
    <div className="p-4 space-y-4">
      {/* Deadline notice */}
      {event.application_deadline && !deadlinePassed && (
        <div className="flex items-center gap-2 p-2 rounded-md text-xs bg-blue-500/10 text-blue-400">
          <Clock size={14} />
          Deadline: {formatDeadline(event.application_deadline)}
        </div>
      )}

      {/* Player Name */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Your Name
        </label>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search your name..."
            value={applicantName || nameSearch}
            onChange={e => {
              setNameSearch(e.target.value);
              setApplicantName('');
              setShowNameDropdown(true);
            }}
            onFocus={() => { if (!applicantName) setShowNameDropdown(true); }}
            onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
            className={inputClass + ' w-full pl-8'}
            style={inputStyle}
          />
          {showNameDropdown && filteredRoster.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border shadow-lg"
              style={{ backgroundColor: 'var(--background-card)', borderColor: 'var(--border)' }}>
              {filteredRoster.map(m => (
                <button key={m.id} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelectName(m.name)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-500/10 transition-fast flex justify-between">
                  <span style={{ color: 'var(--foreground)' }}>{m.name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {m.alliance ? allianceDisplay(m.alliance) : ''} {formatPower(m.power)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {applicantName && applicantPower && (
          <div className="flex gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {applicantAlliance && <span>{allianceDisplay(applicantAlliance)}</span>}
            <span>{formatPower(applicantPower)} power</span>
          </div>
        )}
      </div>

      {/* Focus Commander Header */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <p className="text-xs font-medium text-blue-400 mb-0.5">Focus Commander</p>
        <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{focusCommander}</p>
        {event.notes && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{event.notes}</p>
        )}
      </div>

      {/* Commander Stats */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Your {focusCommander} Stats
        </label>
        <MgeSkillInput
          level={level}
          skills={skills}
          stars={stars}
          onLevelChange={setLevel}
          onSkillsChange={setSkills}
          onStarsChange={setStars}
        />
      </div>

      {/* Commander Screenshot */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Commander Screenshot (optional)
        </label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          Upload a screenshot of your commander to show gear and equipment
        </p>
        {screenshotPreview ? (
          <div className="relative inline-block">
            <img
              src={screenshotPreview}
              alt="Commander screenshot"
              className="rounded-lg border max-h-48 object-contain"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              type="button"
              onClick={removeScreenshot}
              className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-fast"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--background-secondary)] transition-fast"
            style={{ borderColor: 'var(--border)' }}>
            <Camera size={18} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Tap to upload screenshot
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshotChange}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Tier Preferences */}
      {tiers.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Preferred Tier
            </label>
            <select
              value={preferredTier}
              onChange={e => setPreferredTier(e.target.value)}
              className={inputClass + ' w-full'}
              style={inputStyle}
            >
              <option value="">Select...</option>
              {tiers.map(t => (
                <option key={t.tier_label} value={t.tier_label}>
                  {t.tier_label}{t.point_cap ? ` (${formatPower(t.point_cap)} pts)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Lowest Acceptable
            </label>
            <select
              value={maxTier}
              onChange={e => setMaxTier(e.target.value)}
              className={inputClass + ' w-full'}
              style={inputStyle}
            >
              <option value="">Any</option>
              {tiers.map(t => (
                <option key={t.tier_label} value={t.tier_label}>{t.tier_label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Anything else the officer should know..."
          className={inputClass + ' w-full'}
          style={inputStyle}
        />
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !applicantName.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-fast disabled:opacity-40"
      >
        <Send size={14} />
        {submitting ? 'Submitting...' : 'Submit Application'}
      </button>
    </div>
  );
}

function formatPower(power: number): string {
  if (power >= 1_000_000) return `${(power / 1_000_000).toFixed(1)}M`;
  if (power >= 1_000) return `${(power / 1_000).toFixed(0)}K`;
  return power.toString();
}
