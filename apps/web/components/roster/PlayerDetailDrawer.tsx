'use client';

import React, { useEffect, useState } from 'react';
import { X, Shield, Swords, Skull, Heart, Trophy, Calendar, Users, ChevronDown, ChevronUp, Crown } from 'lucide-react';
import { usePlayerDrawer } from '@/lib/roster/player-drawer-context';
import { usePlayerDetail, TROPHY_CONFIG, type PlayerTrophy } from '@/lib/roster/use-player-detail';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import type { RosterSnapshot } from '@/lib/supabase/use-roster-snapshots';
import type { MemberEventStats, EventParticipation } from '@/lib/supabase/use-event-participation';
import type { RosterMember } from '@/lib/roster/roster-types';

export function PlayerDetailDrawer() {
    const { openPlayerName, closePlayer } = usePlayerDrawer();
    const detail = usePlayerDetail(openPlayerName);
    const [visible, setVisible] = useState(false);

    // Animate in/out
    useEffect(() => {
        if (openPlayerName) {
            // Small delay to trigger CSS transition
            requestAnimationFrame(() => setVisible(true));
        } else {
            setVisible(false);
        }
    }, [openPlayerName]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(closePlayer, 200); // Wait for slide-out animation
    };

    if (!openPlayerName) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-200 ${
                    visible ? 'opacity-100' : 'opacity-0'
                }`}
                onClick={handleClose}
            />

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[var(--background)] border-l border-[var(--border)] z-50 overflow-y-auto transition-transform duration-200 ${
                    visible ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                            {openPlayerName}
                        </h2>
                        {detail.member && (
                            <p className="text-sm text-[var(--text-muted)]">
                                {detail.member.alliance || 'No alliance'}{detail.member.role ? ` \u00b7 ${detail.member.role}` : ''}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg hover:bg-[var(--background-secondary)] text-[var(--text-muted)]"
                    >
                        <X size={20} />
                    </button>
                </div>

                {detail.loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400" />
                    </div>
                ) : detail.error ? (
                    <div className="px-6 py-10 text-center text-red-400">{detail.error}</div>
                ) : (
                    <div className="px-6 py-4 space-y-6">
                        {/* Stats Overview */}
                        {detail.member && <StatsOverview member={detail.member} />}

                        {/* Power & KP Chart (mini sparkline) */}
                        {detail.snapshots.length > 1 && <SnapshotChart snapshots={detail.snapshots} />}

                        {/* Name History */}
                        {detail.nameHistory.length > 0 && (
                            <Section title="Previous Names">
                                <div className="flex flex-wrap gap-2">
                                    {detail.nameHistory.map(name => (
                                        <span key={name} className="px-2 py-1 rounded bg-[var(--background-secondary)] text-sm text-[var(--text-secondary)]">
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {/* Trophies */}
                        {detail.trophies.length > 0 && <TrophySection trophies={detail.trophies} />}

                        {/* Event Stats */}
                        {detail.eventStats && <EventSection stats={detail.eventStats} aoo={detail.aooHistory} mob={detail.mobilizationHistory} />}

                        {/* Recent Snapshots Table */}
                        {detail.snapshots.length > 0 && <SnapshotTable snapshots={detail.snapshots} />}
                    </div>
                )}
            </div>
        </>
    );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{title}</h3>
            {children}
        </div>
    );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
    return (
        <div className="bg-[var(--background-secondary)] rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs mb-1">
                {icon}
                {label}
            </div>
            <div className="text-[var(--text-primary)] font-semibold">{value}</div>
            {sub && <div className="text-xs text-[var(--text-muted)]">{sub}</div>}
        </div>
    );
}

function StatsOverview({ member }: { member: RosterMember }) {
    return (
        <Section title="Overview">
            <div className="grid grid-cols-2 gap-3">
                <StatCard
                    icon={<Shield size={14} />}
                    label="Power"
                    value={formatPower(member.power)}
                />
                <StatCard
                    icon={<Swords size={14} />}
                    label="Kill Points"
                    value={formatPower(member.kills)}
                    sub={member.t4_kills || member.t5_kills ? `T4: ${(member.t4_kills || 0).toLocaleString()} \u00b7 T5: ${(member.t5_kills || 0).toLocaleString()}` : undefined}
                />
                <StatCard
                    icon={<Skull size={14} />}
                    label="Deaths"
                    value={(member.deads || 0).toLocaleString()}
                />
                <StatCard
                    icon={<Heart size={14} />}
                    label="Honor"
                    value={formatPower(member.honor_points)}
                />
                <StatCard
                    icon={<Users size={14} />}
                    label="Alliance Helps"
                    value={(member.helps || 0).toLocaleString()}
                />
                <StatCard
                    icon={<Crown size={14} />}
                    label="Gathered"
                    value={formatPower(member.gathered)}
                />
            </div>
            {member.governor_id && (
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                    Governor ID: {member.governor_id}
                </div>
            )}
        </Section>
    );
}

function SnapshotChart({ snapshots }: { snapshots: RosterSnapshot[] }) {
    // Simple mini bar chart showing power over time
    const powers = snapshots.map(s => s.power);
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);
    const range = maxPower - minPower || 1;

    const firstSnap = snapshots[0];
    const lastSnap = snapshots[snapshots.length - 1];
    const powerChange = lastSnap.power - firstSnap.power;
    const kpChange = lastSnap.kills - firstSnap.kills;

    return (
        <Section title="Growth Trend">
            <div className="flex items-end gap-px h-16 mb-2">
                {snapshots.map((s, i) => {
                    const height = ((s.power - minPower) / range) * 100;
                    return (
                        <div
                            key={i}
                            className="flex-1 bg-sky-500/40 rounded-t-sm min-h-[2px] hover:bg-sky-400/60 transition-colors"
                            style={{ height: `${Math.max(height, 3)}%` }}
                            title={`${s.snapshot_date}: ${formatPower(s.power)}`}
                        />
                    );
                })}
            </div>
            <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                <span>
                    Power: <span className={powerChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {powerChange >= 0 ? '+' : ''}{formatPower(powerChange)}
                    </span>
                </span>
                <span>
                    KP: <span className={kpChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {kpChange >= 0 ? '+' : ''}{formatPower(kpChange)}
                    </span>
                </span>
                <span className="ml-auto">{snapshots.length} snapshots</span>
            </div>
        </Section>
    );
}

function TrophySection({ trophies }: { trophies: PlayerTrophy[] }) {
    // Group by type
    const counts: Record<string, number> = {};
    for (const t of trophies) {
        counts[t.trophy_type] = (counts[t.trophy_type] || 0) + 1;
    }

    return (
        <Section title="Trophies">
            <div className="flex gap-3 mb-3">
                {(['legendary', 'epic', 'elite', 'advanced'] as const).map(type => {
                    const count = counts[type] || 0;
                    if (count === 0) return null;
                    const cfg = TROPHY_CONFIG[type];
                    return (
                        <div key={type} className={`flex items-center gap-1.5 px-2 py-1 rounded ${cfg.bgColor}`}>
                            <span>{cfg.emoji}</span>
                            <span className={`text-sm font-medium ${cfg.color}`}>{count}</span>
                        </div>
                    );
                })}
            </div>
            <div className="space-y-1">
                {trophies.slice(0, 10).map((t, i) => {
                    const cfg = TROPHY_CONFIG[t.trophy_type];
                    return (
                        <div key={i} className="flex items-center gap-2 text-sm py-1">
                            <span>{cfg.emoji}</span>
                            <span className={cfg.color}>{cfg.label}</span>
                            <span className="text-[var(--text-muted)] text-xs ml-auto">{t.awarded_date}</span>
                            {t.reason && <span className="text-[var(--text-muted)] text-xs truncate max-w-[120px]" title={t.reason}>{t.reason}</span>}
                        </div>
                    );
                })}
                {trophies.length > 10 && (
                    <div className="text-xs text-[var(--text-muted)]">+{trophies.length - 10} more</div>
                )}
            </div>
        </Section>
    );
}

function EventSection({ stats, aoo, mob }: { stats: MemberEventStats; aoo: EventParticipation[]; mob: EventParticipation[] }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <Section title="Events">
            <div className="grid grid-cols-2 gap-3 mb-3">
                {/* AoO Summary */}
                <div className="bg-[var(--background-secondary)] rounded-lg px-3 py-2">
                    <div className="text-xs text-[var(--text-muted)] mb-1">AoO Attendance</div>
                    <div className="text-[var(--text-primary)] font-semibold">
                        {stats.aoo.participatedCount}/{stats.aoo.totalAssigned}
                    </div>
                    {stats.aoo.lastTeam && (
                        <div className="text-xs text-[var(--text-muted)]">Last: {stats.aoo.lastTeam}</div>
                    )}
                </div>

                {/* Mobilization Summary */}
                <div className="bg-[var(--background-secondary)] rounded-lg px-3 py-2">
                    <div className="text-xs text-[var(--text-muted)] mb-1">Mobilization</div>
                    <div className="text-[var(--text-primary)] font-semibold">
                        {stats.mobilization.lastScore != null ? stats.mobilization.lastScore.toLocaleString() : 'N/A'}
                    </div>
                    {stats.mobilization.growth != null && (
                        <div className={`text-xs ${stats.mobilization.growth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.mobilization.growth >= 0 ? '+' : ''}{stats.mobilization.growth.toLocaleString()}
                        </div>
                    )}
                </div>
            </div>

            {(aoo.length > 0 || mob.length > 0) && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expanded ? 'Hide' : 'Show'} event history
                </button>
            )}

            {expanded && (
                <div className="mt-3 space-y-3">
                    {aoo.length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-[var(--text-muted)] mb-1">AoO History</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {aoo.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                        <span className={e.participated ? 'text-green-400' : 'text-red-400'}>
                                            {e.participated ? '\u2713' : '\u2717'}
                                        </span>
                                        <span className="text-[var(--text-secondary)]">{e.event_date}</span>
                                        {e.team && <span className="text-[var(--text-muted)]">{e.team}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {mob.length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Mobilization History</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {mob.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                        <span className="text-[var(--text-secondary)]">{e.event_date}</span>
                                        <span className="text-[var(--text-primary)]">{e.score?.toLocaleString() || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Section>
    );
}

function SnapshotTable({ snapshots }: { snapshots: RosterSnapshot[] }) {
    const [showAll, setShowAll] = useState(false);
    // Show most recent first
    const reversed = [...snapshots].reverse();
    const displayed = showAll ? reversed : reversed.slice(0, 10);

    return (
        <Section title="Snapshot History">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                            <th className="text-left py-1.5 pr-2">Date</th>
                            <th className="text-right py-1.5 px-2">Power</th>
                            <th className="text-right py-1.5 px-2">KP</th>
                            <th className="text-right py-1.5 pl-2">Honor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map((s, i) => {
                            const prev = reversed[i + 1];
                            return (
                                <tr key={s.id} className="border-b border-[var(--border)]/30">
                                    <td className="py-1.5 pr-2 text-[var(--text-secondary)]">{s.snapshot_date}</td>
                                    <td className="py-1.5 px-2 text-right text-[var(--text-primary)]">
                                        {formatPower(s.power)}
                                        {prev && <ChangeIndicator current={s.power} previous={prev.power} />}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-[var(--text-primary)]">
                                        {formatPower(s.kills)}
                                        {prev && <ChangeIndicator current={s.kills} previous={prev.kills} />}
                                    </td>
                                    <td className="py-1.5 pl-2 text-right text-[var(--text-primary)]">
                                        {formatPower(s.honor_points)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {reversed.length > 10 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="mt-2 text-xs text-sky-400 hover:text-sky-300"
                >
                    {showAll ? 'Show less' : `Show all ${reversed.length} snapshots`}
                </button>
            )}
        </Section>
    );
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
    const diff = current - previous;
    if (diff === 0) return null;
    return (
        <span className={`ml-1 text-[10px] ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {diff > 0 ? '+' : ''}{formatPower(diff)}
        </span>
    );
}
