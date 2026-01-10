'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPower } from '@/lib/supabase/use-alliance-roster';
import { ArrowLeft, Search, ChevronUp, ChevronDown, Edit2, Save, X, Upload, Users } from 'lucide-react';

interface RosterMember {
    id: string;
    name: string;
    power: number;
    kills: number;
    deads: number;
    tier: string | null;
    role: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

type SortField = 'name' | 'power' | 'kills' | 'role';
type SortDirection = 'asc' | 'desc';

const EDITOR_PASSWORD = 'carn-dum';

export default function RosterPage() {
    const [roster, setRoster] = useState<RosterMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('power');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Editor mode
    const [isEditor, setIsEditor] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [editorPassword, setEditorPassword] = useState('');

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ kills: number; notes: string }>({ kills: 0, notes: '' });

    // CSV Import
    const [showImport, setShowImport] = useState(false);
    const [importStatus, setImportStatus] = useState<string | null>(null);

    const fetchRoster = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from('alliance_roster')
                .select('*')
                .eq('is_active', true)
                .order('power', { ascending: false });

            if (fetchError) throw fetchError;
            setRoster(data || []);
        } catch (err) {
            console.error('Error fetching roster:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch roster');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoster();
    }, [fetchRoster]);

    const handlePasswordSubmit = () => {
        if (editorPassword === EDITOR_PASSWORD) {
            setIsEditor(true);
            setShowPasswordPrompt(false);
            setEditorPassword('');
        } else {
            alert('Incorrect password');
            setEditorPassword('');
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'name' ? 'asc' : 'desc');
        }
    };

    const startEditing = (member: RosterMember) => {
        setEditingId(member.id);
        setEditValues({ kills: member.kills || 0, notes: member.notes || '' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditValues({ kills: 0, notes: '' });
    };

    const saveEditing = async () => {
        if (!editingId) return;

        try {
            const { error } = await supabase
                .from('alliance_roster')
                .update({ kills: editValues.kills, notes: editValues.notes || null })
                .eq('id', editingId);

            if (error) throw error;

            setRoster(roster.map(m =>
                m.id === editingId
                    ? { ...m, kills: editValues.kills, notes: editValues.notes || null }
                    : m
            ));
            setEditingId(null);
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save changes');
        }
    };

    const handleImportCSV = async (file: File) => {
        setImportStatus('Reading file...');

        try {
            const content = await file.text();
            const lines = content.trim().split('\n');

            if (lines.length < 2) {
                throw new Error('CSV must have a header row and at least one data row');
            }

            const header = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIdx = header.indexOf('name');
            const powerIdx = header.indexOf('power');
            const killsIdx = header.indexOf('kills');
            const roleIdx = header.indexOf('role') !== -1 ? header.indexOf('role') : header.indexOf('rank');
            const notesIdx = header.indexOf('notes');

            if (nameIdx === -1) {
                throw new Error('CSV must have a "name" column');
            }

            const rows: Partial<RosterMember>[] = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = line.split(',').map(v => v.trim());
                const name = values[nameIdx];
                if (!name) continue;

                rows.push({
                    name,
                    power: powerIdx !== -1 ? parseInt(values[powerIdx], 10) || 0 : 0,
                    kills: killsIdx !== -1 ? parseInt(values[killsIdx], 10) || 0 : 0,
                    role: roleIdx !== -1 ? values[roleIdx] || null : null,
                    notes: notesIdx !== -1 ? values[notesIdx] || null : null,
                    is_active: true,
                });
            }

            setImportStatus(`Importing ${rows.length} members...`);

            const { error } = await supabase
                .from('alliance_roster')
                .upsert(rows, { onConflict: 'name' });

            if (error) throw error;

            setImportStatus(`Successfully imported ${rows.length} members!`);
            setTimeout(() => {
                setImportStatus(null);
                setShowImport(false);
            }, 2000);

            fetchRoster();
        } catch (err) {
            console.error('Import error:', err);
            setImportStatus(`Error: ${err instanceof Error ? err.message : 'Import failed'}`);
        }
    };

    // Filter and sort roster
    const filteredRoster = roster
        .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
            let aVal: string | number = 0;
            let bVal: string | number = 0;

            switch (sortField) {
                case 'name':
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    break;
                case 'power':
                    aVal = a.power;
                    bVal = b.power;
                    break;
                case 'kills':
                    aVal = a.kills || 0;
                    bVal = b.kills || 0;
                    break;
                case 'role':
                    aVal = a.role || 'ZZZ';
                    bVal = b.role || 'ZZZ';
                    break;
            }

            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });

    const totalPower = roster.reduce((sum, m) => sum + m.power, 0);
    const totalKills = roster.reduce((sum, m) => sum + (m.kills || 0), 0);

    // Vision UI theme
    const theme = {
        bg: 'bg-[#0f1535]',
        card: 'bg-[rgba(6,11,40,0.94)] border-white/10 backdrop-blur-xl',
        text: 'text-white',
        textMuted: 'text-[#a0aec0]',
        border: 'border-white/10',
        input: 'bg-[rgba(6,11,40,0.94)] border-white/10 text-white placeholder-[#718096]',
        button: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
        buttonPrimary: 'bg-gradient-to-r from-[#4318ff] to-[#9f7aea] hover:opacity-90 text-white',
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
    };

    if (loading) {
        return (
            <div className={`min-h-screen ${theme.bg} ${theme.text} flex items-center justify-center`}>
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#4318ff] border-t-transparent rounded-full animate-spin"></div>
                    <span className={theme.textMuted}>Loading roster...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
            {/* Grid background */}
            <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

            {/* Header */}
            <header className="bg-[#0f1535]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className={`p-2 rounded-lg ${theme.button} hover:opacity-80 transition-opacity`}
                                title="Back to Home"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alliance Roster</h1>
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#4318ff]/20 text-[#9f7aea]">
                                        {roster.length} members
                                    </span>
                                </div>
                                <p className={`text-sm ${theme.textMuted}`}>Member stats and kill points</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isEditor && (
                                <button
                                    onClick={() => setShowImport(!showImport)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                                >
                                    <Upload className="w-4 h-4" />
                                    Import CSV
                                </button>
                            )}
                            {!isEditor ? (
                                <button
                                    onClick={() => setShowPasswordPrompt(true)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.button}`}
                                >
                                    Edit Mode
                                </button>
                            ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#4318ff] text-white">
                                    Editing
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Password Modal */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className={`${theme.card} border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl`}>
                        <h2 className="text-lg font-semibold mb-4">Enter Password</h2>
                        <input
                            type="password"
                            value={editorPassword}
                            onChange={(e) => setEditorPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            placeholder="Password"
                            className={`w-full px-3 py-2 rounded-lg border ${theme.input} mb-4 focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={handlePasswordSubmit} className={`flex-1 py-2 rounded-lg font-medium ${theme.buttonPrimary}`}>
                                Submit
                            </button>
                            <button onClick={() => setShowPasswordPrompt(false)} className={`flex-1 py-2 rounded-lg font-medium ${theme.button}`}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Panel */}
            {showImport && isEditor && (
                <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
                    <div className={`${theme.card} border rounded-xl p-4`}>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Import Roster from CSV
                        </h3>
                        <p className={`text-sm ${theme.textMuted} mb-3`}>
                            CSV should have columns: name, power, kills (optional), rank/role (optional), notes (optional)
                        </p>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => e.target.files?.[0] && handleImportCSV(e.target.files[0])}
                            className={`w-full px-3 py-2 rounded-lg border ${theme.input}`}
                        />
                        {importStatus && (
                            <p className={`mt-2 text-sm ${importStatus.includes('Error') ? 'text-red-500' : 'text-[#01b574]'}`}>
                                {importStatus}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto p-4 md:p-6">
                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <Users className="w-6 h-6 mx-auto mb-2 text-[#9f7aea]" />
                        <p className={`text-xs ${theme.textMuted}`}>Members</p>
                        <p className="text-2xl font-bold">{roster.length}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Total Power</p>
                        <p className="text-2xl font-bold text-[#01b574]">{formatPower(totalPower)}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Total Kill Points</p>
                        <p className="text-2xl font-bold text-[#f56565]">{formatPower(totalKills)}</p>
                    </div>
                    <div className={`${theme.card} border rounded-xl p-4 text-center`}>
                        <p className={`text-xs ${theme.textMuted}`}>Avg Power</p>
                        <p className="text-2xl font-bold text-[#4318ff]">{formatPower(Math.round(totalPower / roster.length))}</p>
                    </div>
                </div>

                {/* Search */}
                <div className={`${theme.card} border rounded-xl p-4 mb-6`}>
                    <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${theme.textMuted}`} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name..."
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${theme.input} focus:outline-none focus:ring-2 focus:ring-[#4318ff]`}
                        />
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500">
                        {error}
                    </div>
                )}

                {/* Roster Table */}
                <div className={`${theme.card} border rounded-xl overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left px-4 py-3">
                                        <button
                                            onClick={() => handleSort('name')}
                                            className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white`}
                                        >
                                            Name <SortIcon field="name" />
                                        </button>
                                    </th>
                                    <th className="text-right px-4 py-3">
                                        <button
                                            onClick={() => handleSort('power')}
                                            className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                        >
                                            Power <SortIcon field="power" />
                                        </button>
                                    </th>
                                    <th className="text-right px-4 py-3">
                                        <button
                                            onClick={() => handleSort('kills')}
                                            className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white ml-auto`}
                                        >
                                            KP <SortIcon field="kills" />
                                        </button>
                                    </th>
                                    <th className="text-center px-4 py-3">
                                        <button
                                            onClick={() => handleSort('role')}
                                            className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider ${theme.textMuted} hover:text-white mx-auto`}
                                        >
                                            Rank <SortIcon field="role" />
                                        </button>
                                    </th>
                                    <th className="text-left px-4 py-3">
                                        <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                            Notes
                                        </span>
                                    </th>
                                    {isEditor && (
                                        <th className="text-center px-4 py-3">
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                                                Actions
                                            </span>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoster.map((member, idx) => (
                                    <tr
                                        key={member.id}
                                        className={`border-b border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/5`}
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{member.name}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[#01b574]">{formatPower(member.power)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {editingId === member.id ? (
                                                <input
                                                    type="number"
                                                    value={editValues.kills}
                                                    onChange={(e) => setEditValues({ ...editValues, kills: parseInt(e.target.value) || 0 })}
                                                    className={`w-24 px-2 py-1 rounded border ${theme.input} text-right`}
                                                />
                                            ) : (
                                                <span className={member.kills ? 'text-[#f56565]' : theme.textMuted}>
                                                    {member.kills ? formatPower(member.kills) : '-'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {member.role && (
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    member.role === 'R5' ? 'bg-amber-500/20 text-amber-500' :
                                                    member.role === 'R4' ? 'bg-purple-500/20 text-purple-500' :
                                                    member.role === 'R3' ? 'bg-blue-500/20 text-blue-500' :
                                                    member.role === 'R2' ? 'bg-green-500/20 text-green-500' :
                                                    'bg-white/10 text-white/60'
                                                }`}>
                                                    {member.role}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {editingId === member.id ? (
                                                <input
                                                    type="text"
                                                    value={editValues.notes}
                                                    onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded border ${theme.input}`}
                                                    placeholder="Add notes..."
                                                />
                                            ) : (
                                                <span className={`text-sm ${member.notes ? theme.text : theme.textMuted}`}>
                                                    {member.notes || '-'}
                                                </span>
                                            )}
                                        </td>
                                        {isEditor && (
                                            <td className="px-4 py-3 text-center">
                                                {editingId === member.id ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={saveEditing}
                                                            className="p-1.5 rounded hover:bg-green-500/20 text-green-500"
                                                            title="Save"
                                                        >
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEditing}
                                                            className="p-1.5 rounded hover:bg-red-500/20 text-red-500"
                                                            title="Cancel"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEditing(member)}
                                                        className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted}`}
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredRoster.length === 0 && (
                        <div className="py-12 text-center">
                            <p className={theme.textMuted}>No members found</p>
                        </div>
                    )}
                </div>

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                    <p className={`text-xs ${theme.textMuted}`}>Angmar Nazgul Guards - Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>
                        Use CSV import to update roster data
                    </p>
                </footer>
            </div>
        </div>
    );
}
