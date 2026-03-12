'use client';

import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, MapPin, Check, AlertTriangle, ChevronRight, X, Loader2 } from 'lucide-react';
import { parseKingdomXLSX, parseSnapshotCSV } from '@/lib/kingdom/parse';
import type { KingdomExportRow, SnapshotRow } from '@/lib/kingdom/types';
import { cleanAllianceTag } from '@/lib/kingdom/config';
import { supabase } from '@/lib/supabase';
import { createSnapshot } from '@/lib/supabase/use-roster-snapshots';
import { formatPower } from '@/lib/supabase/use-alliance-roster';

// Simplified merged player for upload (no migration tracking)
interface UploadPlayer {
    governorId: number;
    name: string;
    power: number;
    highestPower: number;
    killPoints: number;
    t4Kills: number;
    t5Kills: number;
    deaths: number;
    gathered: number;
    allianceHelps: number;
    currentAlliance: string;
    x: number | null;
    y: number | null;
    castleHall: number | null;
    sources: ('xlsx' | 'csv')[];
}

type Step = 'files' | 'preview' | 'uploading' | 'done';

export function UploadWizard() {
    const [step, setStep] = useState<Step>('files');

    // File state
    const [xlsxFile, setXlsxFile] = useState<File | null>(null);
    const [csvFile, setCsvFile] = useState<File | null>(null);

    // Parsed data
    const [xlsxData, setXlsxData] = useState<KingdomExportRow[]>([]);
    const [csvData, setCsvData] = useState<SnapshotRow[]>([]);
    const [merged, setMerged] = useState<UploadPlayer[]>([]);

    // Status
    const [parseError, setParseError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadResult, setUploadResult] = useState<{ updated: number; added: number; snapshot: boolean } | null>(null);

    // Parse files and merge
    const handleParseAndMerge = useCallback(async () => {
        setParseError(null);

        if (!xlsxFile && !csvFile) {
            setParseError('Please select at least one file');
            return;
        }

        try {
            let xlsx: KingdomExportRow[] = [];
            let csv: SnapshotRow[] = [];

            if (xlsxFile) {
                const buffer = await xlsxFile.arrayBuffer();
                xlsx = await parseKingdomXLSX(buffer);
                setXlsxData(xlsx);
            }

            if (csvFile) {
                const text = await csvFile.text();
                csv = parseSnapshotCSV(text);
                setCsvData(csv);
            }

            // Merge on governor ID
            const byId = new Map<number, UploadPlayer>();

            // 1. Index CSV rows first (has current power, alliance, location)
            for (const row of csv) {
                byId.set(row.playerId, {
                    governorId: row.playerId,
                    name: row.playerName,
                    power: row.playerPower,
                    highestPower: 0,
                    killPoints: row.playerKills,
                    t4Kills: 0,
                    t5Kills: 0,
                    deaths: 0,
                    gathered: 0,
                    allianceHelps: 0,
                    currentAlliance: cleanAllianceTag(row.playerAlliance),
                    x: row.x,
                    y: row.y,
                    castleHall: row.playerCh || null,
                    sources: ['csv'],
                });
            }

            // 2. Merge XLSX data (has accurate names, KP, kills breakdown, gathered, helps)
            for (const row of xlsx) {
                const existing = byId.get(row.governorId);
                if (existing) {
                    // XLSX has more accurate name
                    existing.name = row.name;
                    existing.highestPower = row.highestPower;
                    existing.killPoints = Math.max(existing.killPoints, row.totalKillPoints);
                    existing.t4Kills = row.t4Kills;
                    existing.t5Kills = row.t5Kills;
                    existing.deaths = row.t1Deaths + row.t2Deaths + row.t3Deaths + row.t4Deaths + row.t5Deaths;
                    existing.gathered = row.gathered;
                    existing.allianceHelps = row.allianceHelps;
                    existing.sources.push('xlsx');
                } else {
                    byId.set(row.governorId, {
                        governorId: row.governorId,
                        name: row.name,
                        power: row.power,
                        highestPower: row.highestPower,
                        killPoints: row.totalKillPoints,
                        t4Kills: row.t4Kills,
                        t5Kills: row.t5Kills,
                        deaths: row.t1Deaths + row.t2Deaths + row.t3Deaths + row.t4Deaths + row.t5Deaths,
                        gathered: row.gathered,
                        allianceHelps: row.allianceHelps,
                        currentAlliance: '',
                        x: null,
                        y: null,
                        castleHall: null,
                        sources: ['xlsx'],
                    });
                }
            }

            const players = Array.from(byId.values()).sort((a, b) => b.power - a.power);
            setMerged(players);
            setStep('preview');
        } catch (err) {
            setParseError(err instanceof Error ? err.message : 'Failed to parse files');
        }
    }, [xlsxFile, csvFile]);

    // Upload merged data
    const handleUpload = useCallback(async () => {
        setStep('uploading');
        setUploadError(null);

        try {
            // 1. Fetch existing roster to match by governor_id
            setUploadProgress('Loading existing roster...');
            const { data: existingRoster } = await supabase
                .from('alliance_roster')
                .select('id, name, governor_id, is_active, kills, t4_kills, t5_kills, deads')
                .eq('is_active', true);

            const govIdToExisting = new Map<number, { id: string; kills: number; t4_kills: number; t5_kills: number; deads: number }>();
            for (const m of existingRoster || []) {
                if (m.governor_id) {
                    govIdToExisting.set(m.governor_id, {
                        id: m.id,
                        kills: m.kills || 0,
                        t4_kills: m.t4_kills || 0,
                        t5_kills: m.t5_kills || 0,
                        deads: m.deads || 0,
                    });
                }
            }

            let updated = 0;
            let added = 0;

            // 2. Update or insert players
            setUploadProgress(`Processing ${merged.length} players...`);
            for (let i = 0; i < merged.length; i++) {
                const player = merged[i];
                const existing = govIdToExisting.get(player.governorId);

                if (i % 50 === 0) {
                    setUploadProgress(`Processing ${i + 1}/${merged.length} players...`);
                }

                if (existing) {
                    // Update existing — only update kills if new value is higher
                    const updateData: Record<string, unknown> = {
                        power: player.power,
                        governor_id: player.governorId,
                    };

                    if (player.highestPower > 0) updateData.highest_power = player.highestPower;
                    if (player.currentAlliance) updateData.alliance = player.currentAlliance;
                    if (player.gathered > 0) updateData.gathered = player.gathered;
                    if (player.allianceHelps > 0) updateData.helps = player.allianceHelps;
                    if (player.deaths > 0 && player.deaths > existing.deads) updateData.deads = player.deaths;
                    if (player.killPoints > existing.kills) updateData.kills = player.killPoints;
                    if (player.t4Kills > existing.t4_kills) updateData.t4_kills = player.t4Kills;
                    if (player.t5Kills > existing.t5_kills) updateData.t5_kills = player.t5Kills;

                    const { error } = await supabase
                        .from('alliance_roster')
                        .update(updateData)
                        .eq('id', existing.id);

                    if (!error) updated++;
                } else {
                    // Insert new player
                    const insertData: Record<string, unknown> = {
                        name: player.name,
                        governor_id: player.governorId,
                        power: player.power,
                        highest_power: player.highestPower || 0,
                        kills: player.killPoints || 0,
                        t4_kills: player.t4Kills || 0,
                        t5_kills: player.t5Kills || 0,
                        deads: player.deaths || 0,
                        gathered: player.gathered || 0,
                        helps: player.allianceHelps || 0,
                        alliance: player.currentAlliance || null,
                        is_active: true,
                    };

                    const { error } = await supabase
                        .from('alliance_roster')
                        .upsert(insertData, { onConflict: 'name' });

                    if (!error) added++;
                }
            }

            // 3. Create snapshot
            setUploadProgress('Creating snapshot...');
            let snapshotOk = false;
            try {
                const { data: currentRoster } = await supabase
                    .from('alliance_roster')
                    .select('name, power, kills, t4_kills, t5_kills, honor_points, role, is_active')
                    .eq('is_active', true);

                if (currentRoster) {
                    const snapshotData = currentRoster.map(r => ({
                        name: r.name,
                        power: r.power || 0,
                        kills: r.kills || 0,
                        t4_kills: r.t4_kills || 0,
                        t5_kills: r.t5_kills || 0,
                        honor_points: r.honor_points || 0,
                        role: r.role || null,
                        is_active: true,
                    }));
                    await createSnapshot(snapshotData);
                    snapshotOk = true;
                }
            } catch {
                // Snapshot failed but upload succeeded
            }

            // 4. Also store as kingdom scan for historical tracking
            setUploadProgress('Saving kingdom scan record...');
            try {
                const label = `Upload ${new Date().toISOString().slice(0, 10)}`;
                const { data: scan, error: scanErr } = await supabase
                    .from('kingdom_scans')
                    .insert({
                        label,
                        snapshot_count: csvData.length,
                        kingdom_count: xlsxData.length,
                        migrant_count: 0,
                        pre_migration_count: 0,
                    })
                    .select('id')
                    .single();

                if (!scanErr && scan) {
                    // Batch insert scan players (500 at a time)
                    const scanPlayers = merged.map(p => ({
                        scan_id: scan.id,
                        governor_id: p.governorId,
                        name: p.name,
                        power: p.power,
                        highest_power: p.highestPower,
                        kill_points: p.killPoints,
                        t4_kills: p.t4Kills,
                        t5_kills: p.t5Kills,
                        deaths: p.deaths,
                        gathered: p.gathered,
                        alliance_helps: p.allianceHelps,
                        current_alliance: p.currentAlliance,
                        x: p.x,
                        y: p.y,
                        castle_hall: p.castleHall,
                        migration_status: 'ORIGINAL',
                        is_migrant: false,
                        migrant_accepted: false,
                        existed_pre_migration: false,
                        sources: p.sources,
                    }));

                    for (let i = 0; i < scanPlayers.length; i += 500) {
                        const batch = scanPlayers.slice(i, i + 500);
                        await supabase.from('kingdom_scan_players').upsert(batch, {
                            onConflict: 'scan_id,governor_id',
                        });
                    }
                }
            } catch {
                // Scan record failed but main upload succeeded
            }

            setUploadResult({ updated, added, snapshot: snapshotOk });
            setStep('done');
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
            setStep('preview'); // Go back to preview on error
        }
    }, [merged, csvData.length, xlsxData.length]);

    const reset = () => {
        setStep('files');
        setXlsxFile(null);
        setCsvFile(null);
        setXlsxData([]);
        setCsvData([]);
        setMerged([]);
        setParseError(null);
        setUploadError(null);
        setUploadResult(null);
        setUploadProgress('');
    };

    const theme = {
        card: 'bg-[var(--background-card)] border-[var(--border)] backdrop-blur-xl',
        text: 'text-[var(--foreground)]',
        textMuted: 'text-[var(--text-secondary)]',
        input: 'bg-[var(--background-card)] border-[var(--border)] text-[var(--foreground)]',
        button: 'bg-[var(--background-card)] hover:opacity-80 text-[var(--foreground)] border border-[var(--border)]',
        buttonPrimary: 'bg-gradient-to-r from-[#4318ff] to-[#9f7aea] hover:opacity-90 text-white',
    };

    // Merge stats
    const bothSources = merged.filter(p => p.sources.length === 2).length;
    const xlsxOnly = merged.filter(p => p.sources.length === 1 && p.sources[0] === 'xlsx').length;
    const csvOnly = merged.filter(p => p.sources.length === 1 && p.sources[0] === 'csv').length;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 text-sm">
                {(['files', 'preview', 'done'] as const).map((s, i) => (
                    <React.Fragment key={s}>
                        {i > 0 && <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
                        <span className={`px-3 py-1 rounded-full ${
                            step === s || (step === 'uploading' && s === 'preview')
                                ? 'bg-sky-500/15 text-sky-400 font-medium'
                                : 'text-[var(--text-muted)]'
                        }`}>
                            {s === 'files' ? '1. Select Files' : s === 'preview' ? '2. Review' : '3. Done'}
                        </span>
                    </React.Fragment>
                ))}
            </div>

            {/* Step 1: File Selection */}
            {step === 'files' && (
                <div className="space-y-4">
                    <div className={`${theme.card} border rounded-xl p-6`}>
                        <h3 className="text-lg font-semibold mb-1">Kingdom Stats Export (XLSX)</h3>
                        <p className={`text-sm ${theme.textMuted} mb-4`}>
                            In-game export with accurate names, KP, kills breakdown, gathered, alliance helps.
                            This is the primary source of truth for player names.
                        </p>
                        <FileDropZone
                            accept=".xlsx,.xls"
                            file={xlsxFile}
                            onFile={setXlsxFile}
                            icon={<FileSpreadsheet className="w-6 h-6" />}
                            label="Kingdom Stats XLSX"
                        />
                    </div>

                    <div className={`${theme.card} border rounded-xl p-6`}>
                        <h3 className="text-lg font-semibold mb-1">Map Scan (CSV)</h3>
                        <p className={`text-sm ${theme.textMuted} mb-4`}>
                            Scanner export with current power, alliance, coordinates.
                            Merged with XLSX on governor ID.
                        </p>
                        <FileDropZone
                            accept=".csv"
                            file={csvFile}
                            onFile={setCsvFile}
                            icon={<MapPin className="w-6 h-6" />}
                            label="Map Scan CSV"
                        />
                    </div>

                    {parseError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {parseError}
                        </div>
                    )}

                    <button
                        onClick={handleParseAndMerge}
                        disabled={!xlsxFile && !csvFile}
                        className={`w-full py-3 rounded-xl font-medium text-sm ${theme.buttonPrimary} disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    >
                        Parse & Merge Files
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Step 2: Preview */}
            {(step === 'preview' || step === 'uploading') && (
                <div className="space-y-4">
                    {/* Merge Summary */}
                    <div className={`${theme.card} border rounded-xl p-6`}>
                        <h3 className="text-lg font-semibold mb-4">Merge Summary</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-sky-400">{merged.length}</div>
                                <div className={`text-xs ${theme.textMuted}`}>Total Players</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">{bothSources}</div>
                                <div className={`text-xs ${theme.textMuted}`}>Both Sources</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-400">{xlsxOnly}</div>
                                <div className={`text-xs ${theme.textMuted}`}>XLSX Only</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-400">{csvOnly}</div>
                                <div className={`text-xs ${theme.textMuted}`}>CSV Only</div>
                            </div>
                        </div>
                    </div>

                    {/* Player Preview Table */}
                    <div className={`${theme.card} border rounded-xl`}>
                        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                            <span className="text-sm font-medium">Player Preview</span>
                            <span className={`text-xs ${theme.textMuted}`}>Showing top 100 by power</span>
                        </div>
                        <div className="overflow-auto max-h-[50vh]">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-[var(--background-card)]">
                                    <tr className="border-b border-[var(--border)]">
                                        <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">#</th>
                                        <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">Name</th>
                                        <th className="text-right px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">Power</th>
                                        <th className="text-right px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">KP</th>
                                        <th className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">Alliance</th>
                                        <th className="text-center px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">Sources</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {merged.slice(0, 100).map((p, i) => (
                                        <tr key={p.governorId} className="border-b border-[var(--border)]/30 hover:bg-[var(--background-secondary)]/30">
                                            <td className={`px-3 py-1.5 ${theme.textMuted}`}>{i + 1}</td>
                                            <td className="px-3 py-1.5 font-medium">{p.name}</td>
                                            <td className="px-3 py-1.5 text-right text-green-400">{formatPower(p.power)}</td>
                                            <td className="px-3 py-1.5 text-right text-red-400">{p.killPoints ? formatPower(p.killPoints) : '-'}</td>
                                            <td className="px-3 py-1.5 text-purple-400">{p.currentAlliance || '-'}</td>
                                            <td className="px-3 py-1.5 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {p.sources.includes('xlsx') && (
                                                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/20 text-purple-400">XLSX</span>
                                                    )}
                                                    {p.sources.includes('csv') && (
                                                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500/20 text-orange-400">CSV</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {merged.length > 100 && (
                            <div className={`px-4 py-2 border-t border-[var(--border)] text-xs ${theme.textMuted} text-center`}>
                                + {merged.length - 100} more players
                            </div>
                        )}
                    </div>

                    {uploadError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {uploadError}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={() => setStep('files')}
                            disabled={step === 'uploading'}
                            className={`flex-1 py-3 rounded-xl font-medium text-sm ${theme.button} disabled:opacity-40`}
                        >
                            Back
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={step === 'uploading'}
                            className={`flex-1 py-3 rounded-xl font-medium text-sm ${theme.buttonPrimary} disabled:opacity-70 flex items-center justify-center gap-2`}
                        >
                            {step === 'uploading' ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {uploadProgress}
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Upload {merged.length} Players
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Done */}
            {step === 'done' && uploadResult && (
                <div className={`${theme.card} border rounded-xl p-8 text-center`}>
                    <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Upload Complete</h3>
                    <div className={`space-y-1 ${theme.textMuted} text-sm mb-6`}>
                        <p>Updated <strong className="text-[var(--foreground)]">{uploadResult.updated}</strong> existing players</p>
                        <p>Added <strong className="text-[var(--foreground)]">{uploadResult.added}</strong> new players</p>
                        <p>Snapshot: {uploadResult.snapshot ? (
                            <span className="text-green-400">Saved</span>
                        ) : (
                            <span className="text-yellow-400">Failed (data still uploaded)</span>
                        )}</p>
                    </div>
                    <button
                        onClick={reset}
                        className={`px-6 py-2.5 rounded-xl font-medium text-sm ${theme.button}`}
                    >
                        Upload Another
                    </button>
                </div>
            )}
        </div>
    );
}

// File drop zone component
function FileDropZone({
    accept,
    file,
    onFile,
    icon,
    label,
}: {
    accept: string;
    file: File | null;
    onFile: (f: File | null) => void;
    icon: React.ReactNode;
    label: string;
}) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) onFile(droppedFile);
    }, [onFile]);

    if (file) {
        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                    onClick={() => onFile(null)}
                    className="p-1 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <label
            className={`relative block cursor-pointer ${isDragging ? 'ring-2 ring-sky-500' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            <input
                type="file"
                accept={accept}
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className={`px-4 py-6 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-sky-500/50 transition-colors text-center ${isDragging ? 'border-sky-500 bg-sky-500/5' : ''}`}>
                <div className="text-[var(--text-muted)] mx-auto mb-2">{icon}</div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Drag & drop or click to browse</p>
            </div>
        </label>
    );
}
