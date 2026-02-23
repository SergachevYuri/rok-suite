'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import {
    useKingTrophies,
    useMemberTrophyCounts,
    awardTrophy,
    removeTrophy,
    getTrophiesForWeek,
    getTrophyWeeks,
    getWeekStart,
    formatTrophyDate,
    calculateTrophyScore,
    TROPHY_CONFIG,
    type TrophyType,
    type TrophyWithMember,
    type MemberTrophyCounts,
} from '@/lib/supabase/use-king-trophies';
import { Crown, Trophy, Award, Medal, Star, ChevronDown, ChevronUp, Plus, Trash2, Lock, Calendar, Users, ScrollText } from 'lucide-react';
import { allianceDisplay } from '@/lib/alliances';

import { ADMIN_PASSWORD as EDITOR_PASSWORD } from '@/lib/auth-passwords';

// Trophy type order for display
const TROPHY_ORDER: TrophyType[] = ['legendary', 'epic', 'elite', 'advanced'];

interface RosterMember {
    id: string;
    name: string;
    alliance: string | null;
    power: number;
}

export default function RecognitionPage() {
    const { theme: currentTheme } = useTheme();
    const { trophies, loading: trophiesLoading, refetch: refetchTrophies } = useKingTrophies();
    const { counts: trophyCounts, refetch: refetchCounts } = useMemberTrophyCounts();

    // Editor mode
    const [isEditor, setIsEditor] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');

    // Award form
    const [showAwardForm, setShowAwardForm] = useState(false);
    const [awardMemberId, setAwardMemberId] = useState('');
    const [awardType, setAwardType] = useState<TrophyType>('advanced');
    const [awardReason, setAwardReason] = useState('');
    const [awardWeek, setAwardWeek] = useState(getWeekStart());
    const [awardStatus, setAwardStatus] = useState<string | null>(null);

    // Roster for member selection
    const [roster, setRoster] = useState<RosterMember[]>([]);
    const [memberSearch, setMemberSearch] = useState('');

    // View mode
    const [viewMode, setViewMode] = useState<'winners' | 'history'>('winners');
    const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

    // Theme
    const theme = {
        bg: 'bg-[var(--background)]',
        card: 'bg-[var(--background-card)] border-[var(--border)]',
        text: 'text-[var(--foreground)]',
        textMuted: 'text-[var(--text-secondary)]',
        border: 'border-[var(--border)]',
        input: 'bg-[var(--background-secondary)] border-[var(--border)] text-[var(--foreground)]',
    };

    // Fetch roster for member selection
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

    // Group trophies by week
    const trophiesByWeek = useMemo(() => {
        const grouped = new Map<string, TrophyWithMember[]>();
        for (const trophy of trophies) {
            const week = trophy.week_of;
            if (!grouped.has(week)) {
                grouped.set(week, []);
            }
            grouped.get(week)!.push(trophy);
        }
        // Sort each week's trophies by type
        for (const [, weekTrophies] of grouped) {
            weekTrophies.sort((a, b) => {
                return TROPHY_ORDER.indexOf(a.trophy_type as TrophyType) - TROPHY_ORDER.indexOf(b.trophy_type as TrophyType);
            });
        }
        return grouped;
    }, [trophies]);

    // Get sorted weeks
    const sortedWeeks = useMemo(() => {
        return [...trophiesByWeek.keys()].sort((a, b) => b.localeCompare(a));
    }, [trophiesByWeek]);

    // Leaderboard data
    const leaderboard = useMemo(() => {
        const entries: Array<{
            memberId: string;
            memberName: string;
            memberAlliance: string | null;
            counts: MemberTrophyCounts;
            score: number;
        }> = [];

        trophyCounts.forEach((counts, memberId) => {
            // Find member name from trophies
            const trophy = trophies.find(t => t.member_id === memberId);
            if (trophy) {
                entries.push({
                    memberId,
                    memberName: trophy.member_name,
                    memberAlliance: trophy.member_alliance,
                    counts,
                    score: calculateTrophyScore(counts),
                });
            }
        });

        return entries.sort((a, b) => b.score - a.score);
    }, [trophyCounts, trophies]);

    // Filter roster for member selection
    const filteredRoster = useMemo(() => {
        if (!memberSearch) return roster.slice(0, 20);
        const search = memberSearch.toLowerCase();
        return roster.filter(m => m.name.toLowerCase().includes(search)).slice(0, 20);
    }, [roster, memberSearch]);

    const handleEditorLogin = () => {
        if (editorPassword === EDITOR_PASSWORD) {
            setIsEditor(true);
            setShowPasswordPrompt(false);
            setEditorPassword('');
        } else {
            alert('Incorrect password');
        }
    };

    const handleAwardTrophy = async () => {
        if (!awardMemberId) {
            setAwardStatus('Please select a member');
            return;
        }

        setAwardStatus('Awarding trophy...');
        const result = await awardTrophy(awardMemberId, awardType, awardReason || undefined, awardWeek);

        if (result.success) {
            setAwardStatus('Trophy awarded!');
            setAwardMemberId('');
            setAwardReason('');
            setMemberSearch('');
            refetchTrophies();
            refetchCounts();
            setTimeout(() => setAwardStatus(null), 2000);
        } else {
            setAwardStatus(`Error: ${result.error}`);
        }
    };

    const handleRemoveTrophy = async (trophyId: string) => {
        if (!confirm('Remove this trophy?')) return;

        const result = await removeTrophy(trophyId);
        if (result.success) {
            refetchTrophies();
            refetchCounts();
        } else {
            alert(`Error: ${result.error}`);
        }
    };

    const toggleWeek = (week: string) => {
        const newExpanded = new Set(expandedWeeks);
        if (newExpanded.has(week)) {
            newExpanded.delete(week);
        } else {
            newExpanded.add(week);
        }
        setExpandedWeeks(newExpanded);
    };

    const formatWeekLabel = (weekOf: string) => {
        const start = new Date(weekOf);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    };

    const generateTrophyMail = (weekOf: string, weekTrophies: TrophyWithMember[]) => {
        const header = `<size=30px><color=#4d0000>KINGDOM 3923</color> <color=#cc0000>—</color> <color=#4d0000>A</color><color=#660000>N</color><color=#800000>G</color><color=#990000>M</color><color=#b30000>A</color><color=#cc0000>R</color> <color=#4d0000>N</color><color=#660000>A</color><color=#800000>Z</color><color=#990000>G</color><color=#b30000>U</color><color=#cc0000>L</color> <color=#e60000>G</color><color=#ff0000>U</color><color=#ff0000>A</color><color=#cc0000>R</color><color=#990000>D</color><color=#800000>S</color></size>`;
        const divider = '►═════════❂❂❂═════════◄';

        const lines: string[] = [];
        lines.push(header);
        lines.push(divider);
        lines.push('');
        lines.push(`<b><color=#ff3333>King's Recognition — ${formatWeekLabel(weekOf)}</color></b>`);
        lines.push('');

        for (const type of TROPHY_ORDER) {
            const typeTrophies = weekTrophies.filter(t => t.trophy_type === type);
            if (typeTrophies.length === 0) continue;

            const cfg = TROPHY_CONFIG[type];
            lines.push(`<b>${cfg.label}</b>`);
            for (const t of typeTrophies) {
                const reason = t.reason ? ` — <i>${t.reason}</i>` : '';
                lines.push(`${t.member_name}${reason}`);
            }
            lines.push('');
        }

        lines.push(divider);
        lines.push(`<b><color=#800000>— King Fluffy</color></b>`);

        localStorage.setItem('rok-mail-draft', lines.join('\n'));
        window.location.href = '/rok-mail';
    };

    return (
        <AppSidebar>
            <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
                {/* Header */}
                <header className="bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-14 lg:top-0 z-30">
                    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-lg bg-violet-500/15">
                                    <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" />
                                </div>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">King&apos;s Recognition</h1>
                                    <p className="text-sm text-[var(--text-secondary)]">Celebrating excellence in Kingdom 23</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditor ? (
                                    <button
                                        onClick={() => setShowPasswordPrompt(true)}
                                        className={`p-2 rounded-lg ${theme.card} hover:bg-[var(--background-secondary)] transition-colors`}
                                        title="Editor mode"
                                    >
                                        <Lock size={20} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowAwardForm(!showAwardForm)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                    >
                                        <Plus size={18} />
                                        <span className="hidden sm:inline">Award Trophy</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
                    {/* Password Prompt Modal */}
                    {showPasswordPrompt && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-6 rounded-xl max-w-sm w-full mx-4">
                                <h3 className="text-lg font-semibold mb-4">Editor Access</h3>
                                <input
                                    type="password"
                                    value={editorPassword}
                                    onChange={(e) => setEditorPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEditorLogin()}
                                    placeholder="Enter password"
                                    className={`w-full px-4 py-2 rounded-lg border ${theme.input} mb-4`}
                                    autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => { setShowPasswordPrompt(false); setEditorPassword(''); }}
                                        className={`px-4 py-2 rounded-lg ${theme.card} hover:bg-[var(--background-secondary)]`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleEditorLogin}
                                        className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                    >
                                        Login
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Award Form */}
                    {showAwardForm && isEditor && (
                        <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-6 rounded-xl">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-amber-400" />
                                Award Trophy
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className={`block text-sm ${theme.textMuted} mb-1`}>Member</label>
                                    <input
                                        type="text"
                                        value={memberSearch}
                                        onChange={(e) => setMemberSearch(e.target.value)}
                                        placeholder="Search member..."
                                        className={`w-full px-4 py-2 rounded-lg border ${theme.input}`}
                                    />
                                    {memberSearch && (
                                        <div className={`mt-1 max-h-40 overflow-y-auto rounded-lg border ${theme.card}`}>
                                            {filteredRoster.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setAwardMemberId(m.id); setMemberSearch(m.name); }}
                                                    className={`w-full text-left px-3 py-2 hover:bg-[var(--background-secondary)] ${awardMemberId === m.id ? 'bg-amber-500/20' : ''}`}
                                                >
                                                    {m.name} <span className={theme.textMuted}>({allianceDisplay(m.alliance)})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={`block text-sm ${theme.textMuted} mb-1`}>Trophy Type</label>
                                    <select
                                        value={awardType}
                                        onChange={(e) => setAwardType(e.target.value as TrophyType)}
                                        className={`w-full px-4 py-2 rounded-lg border ${theme.input}`}
                                    >
                                        {TROPHY_ORDER.map(type => (
                                            <option key={type} value={type}>
                                                {TROPHY_CONFIG[type].emoji} {TROPHY_CONFIG[type].label} ({TROPHY_CONFIG[type].maxPerWeek}/week)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-sm ${theme.textMuted} mb-1`}>Week Of</label>
                                    <input
                                        type="date"
                                        value={awardWeek}
                                        onChange={(e) => setAwardWeek(e.target.value)}
                                        className={`w-full px-4 py-2 rounded-lg border ${theme.input}`}
                                    />
                                </div>
                                <div>
                                    <label className={`block text-sm ${theme.textMuted} mb-1`}>Reason (optional)</label>
                                    <input
                                        type="text"
                                        value={awardReason}
                                        onChange={(e) => setAwardReason(e.target.value)}
                                        placeholder="e.g., Outstanding AoO performance"
                                        className={`w-full px-4 py-2 rounded-lg border ${theme.input}`}
                                    />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                {awardStatus && (
                                    <span className={`text-sm ${awardStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                                        {awardStatus}
                                    </span>
                                )}
                                <button
                                    onClick={handleAwardTrophy}
                                    className="ml-auto px-6 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                                >
                                    Award Trophy
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Trophy Type Legend */}
                    <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-4 rounded-xl">
                        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8">
                            {TROPHY_ORDER.map(type => (
                                <div key={type} className="flex items-center gap-2">
                                    <span className="text-2xl">{TROPHY_CONFIG[type].emoji}</span>
                                    <div>
                                        <div className={`font-medium ${TROPHY_CONFIG[type].color}`}>{TROPHY_CONFIG[type].label}</div>
                                        <div className={`text-xs ${theme.textMuted}`}>{TROPHY_CONFIG[type].maxPerWeek}/week</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* View Toggle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('winners')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                                viewMode === 'winners'
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : `${theme.card} hover:bg-[var(--background-secondary)]`
                            }`}
                        >
                            <Users size={18} />
                            Trophy Winners
                        </button>
                        <button
                            onClick={() => setViewMode('history')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                                viewMode === 'history'
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : `${theme.card} hover:bg-[var(--background-secondary)]`
                            }`}
                        >
                            <Calendar size={18} />
                            History
                        </button>
                    </div>

                    {trophiesLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-400 border-t-transparent mx-auto mb-4"></div>
                            <p className={theme.textMuted}>Loading trophies...</p>
                        </div>
                    ) : trophies.length === 0 ? (
                        <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] p-12 rounded-xl text-center">
                            <Trophy className="w-16 h-16 mx-auto mb-4 text-amber-400/30" />
                            <h3 className="text-xl font-semibold mb-2">No Trophies Yet</h3>
                            <p className={theme.textMuted}>The King hasn&apos;t awarded any recognition trophies yet.</p>
                            {isEditor && (
                                <button
                                    onClick={() => setShowAwardForm(true)}
                                    className="mt-4 px-6 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                >
                                    Award First Trophy
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'winners' ? (
                        /* Trophy Winners View */
                        <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-[var(--border)]">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-amber-400" />
                                    Trophy Winners
                                </h2>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {leaderboard.map((entry, idx) => (
                                    <div
                                        key={entry.memberId}
                                        className={`flex items-center gap-4 p-4 ${idx < 3 ? 'bg-amber-500/5' : ''}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                            idx === 0 ? 'bg-amber-500 text-black' :
                                            idx === 1 ? 'bg-gray-400 text-black' :
                                            idx === 2 ? 'bg-amber-700 text-white' :
                                            'bg-[var(--background-secondary)] text-[var(--text-muted)]'
                                        }`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold truncate">{entry.memberName}</div>
                                            <div className={`text-sm ${theme.textMuted}`}>{entry.memberAlliance || '-'}</div>
                                        </div>
                                        <div className="flex items-center gap-1 text-lg">
                                            {entry.counts.legendary_count > 0 && (
                                                <span title={`${entry.counts.legendary_count} Legendary`}>
                                                    {TROPHY_CONFIG.legendary.emoji}
                                                    {entry.counts.legendary_count > 1 && <sup className="text-xs">{entry.counts.legendary_count}</sup>}
                                                </span>
                                            )}
                                            {entry.counts.epic_count > 0 && (
                                                <span title={`${entry.counts.epic_count} Epic`}>
                                                    {TROPHY_CONFIG.epic.emoji}
                                                    {entry.counts.epic_count > 1 && <sup className="text-xs">{entry.counts.epic_count}</sup>}
                                                </span>
                                            )}
                                            {entry.counts.elite_count > 0 && (
                                                <span title={`${entry.counts.elite_count} Elite`}>
                                                    {TROPHY_CONFIG.elite.emoji}
                                                    {entry.counts.elite_count > 1 && <sup className="text-xs">{entry.counts.elite_count}</sup>}
                                                </span>
                                            )}
                                            {entry.counts.advanced_count > 0 && (
                                                <span title={`${entry.counts.advanced_count} Advanced`}>
                                                    {TROPHY_CONFIG.advanced.emoji}
                                                    {entry.counts.advanced_count > 1 && <sup className="text-xs">{entry.counts.advanced_count}</sup>}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-right ${theme.textMuted}`}>
                                            <div className="text-sm">{entry.counts.total_count} total</div>
                                            <div className="text-xs">{entry.score} pts</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* History View */
                        <div className="space-y-4">
                            {sortedWeeks.map(week => {
                                const weekTrophies = trophiesByWeek.get(week) || [];
                                const isExpanded = expandedWeeks.has(week) || sortedWeeks.indexOf(week) === 0;

                                return (
                                    <div key={week} className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => toggleWeek(week)}
                                            className="w-full flex items-center justify-between p-4 hover:bg-[var(--background-secondary)] transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Calendar className="w-5 h-5 text-amber-400" />
                                                <div className="text-left">
                                                    <div className="font-semibold">{formatWeekLabel(week)}</div>
                                                    <div className={`text-sm ${theme.textMuted}`}>
                                                        {weekTrophies.length} trophies awarded
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isEditor && (
                                                    <span
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={(e) => { e.stopPropagation(); generateTrophyMail(week, weekTrophies); }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); generateTrophyMail(week, weekTrophies); } }}
                                                        className="p-1.5 rounded-md hover:bg-pink-500/10 text-pink-400/70 hover:text-pink-400 transition-colors"
                                                        title="Generate mail"
                                                    >
                                                        <ScrollText size={16} />
                                                    </span>
                                                )}
                                                <div className="flex gap-1">
                                                    {TROPHY_ORDER.map(type => {
                                                        const count = weekTrophies.filter(t => t.trophy_type === type).length;
                                                        return count > 0 ? (
                                                            <span key={type} title={`${count} ${TROPHY_CONFIG[type].label}`}>
                                                                {TROPHY_CONFIG[type].emoji}
                                                            </span>
                                                        ) : null;
                                                    })}
                                                </div>
                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                                                {weekTrophies.map(trophy => (
                                                    <div key={trophy.id} className="flex items-center gap-4 p-4">
                                                        <span className="text-2xl">{TROPHY_CONFIG[trophy.trophy_type as TrophyType].emoji}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-semibold">{trophy.member_name}</div>
                                                            <div className={`text-sm ${theme.textMuted}`}>
                                                                {trophy.member_alliance || '-'}
                                                                {trophy.reason && ` • ${trophy.reason}`}
                                                            </div>
                                                        </div>
                                                        <div className={`text-sm ${TROPHY_CONFIG[trophy.trophy_type as TrophyType].color}`}>
                                                            {TROPHY_CONFIG[trophy.trophy_type as TrophyType].label}
                                                        </div>
                                                        {isEditor && (
                                                            <button
                                                                onClick={() => handleRemoveTrophy(trophy.id)}
                                                                className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                                                                title="Remove trophy"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Back link */}
                    <div className="text-center pt-4">
                        <Link
                            href="/rosters"
                            className={`inline-flex items-center gap-2 ${theme.textMuted} hover:text-[var(--foreground)] transition-colors`}
                        >
                            View full roster
                        </Link>
                    </div>
                </div>
            </div>
        </AppSidebar>
    );
}
