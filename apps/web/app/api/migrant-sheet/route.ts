import { NextResponse } from 'next/server';

// Public Google Sheet for K23 migrant applications. Anyone with the link can read.
// (The sheet is the same one referenced in the Emigration page docs.)
const SHEET_ID = '1jfLUOJavKN6hgHTFxuNPht919azqKpmPsRXoy7AiqZQ';
const SHEET_GID = '0';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// Column indexes (0-based) in the exported CSV. The sheet has no usable header row,
// so positions are hard-coded against the column order documented on the Emigration
// page: Name | Governor ID | Discord | Power | Total KP | T4 KP | T5 KP | Dead | DKP
// | VIP | Tier | Acct Age | Current Kingdom | KvK2 Repeat | Gold Heads | Speed Ups
// | Player Type | Time Zone | Garrison/Rally | Armaments | Decision | Free form…
const COL_GOV_ID = 1;
const COL_DECISION = 20;
const COL_NAME = 0;
const COL_PLAYER_TYPE = 16;
const COL_TIME_ZONE = 17;

type Decision = 'yes' | 'no' | 'maybe' | 'unknown';

interface MigrantRow {
  governorId: number;
  decision: Decision;
  /** Original raw value before normalization, so the UI can show e.g. "Pending" or "Found Another Kingdom". */
  decisionRaw: string;
  name: string;
  playerType: string;
  timeZone: string;
  row: number;
}

function normalizeDecision(raw: string): Decision {
  const v = raw.trim().toLowerCase();
  if (!v) return 'unknown';
  if (v.startsWith('yes')) return 'yes';
  if (v.startsWith('no')) return 'no';
  if (v.startsWith('maybe') || v.startsWith('pending')) return 'maybe';
  // "Found Another Kingdom" et al. mean they didn't end up in K23. Bucket as 'no' so
  // they don't accidentally land in the "approved" hidden list — they're targets if
  // they show up on a scan against expectations.
  if (v.includes('found') || v.includes('elsewhere') || v.includes('different')) return 'no';
  return 'unknown';
}

/** Minimal CSV line parser — handles quoted values containing commas + escaped quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch === '\r') {
      // skip — handled by \n
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export async function GET() {
  let csv: string;
  try {
    const res = await fetch(SHEET_URL, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Google returned ${res.status}. Sheet must be shared as 'Anyone with the link can view'.` },
        { status: 502 },
      );
    }
    csv = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch sheet: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const grid = parseCsv(csv);
  const rows: MigrantRow[] = [];
  let counts = { yes: 0, no: 0, maybe: 0, unknown: 0 };
  for (let i = 0; i < grid.length; i++) {
    const r = grid[i];
    const idRaw = (r[COL_GOV_ID] ?? '').trim();
    if (!idRaw) continue;
    const id = Number(idRaw.replace(/\D/g, ''));
    if (!Number.isFinite(id) || id <= 0) continue;
    const decisionRaw = (r[COL_DECISION] ?? '').trim();
    const decision = normalizeDecision(decisionRaw);
    counts[decision]++;
    rows.push({
      governorId: id,
      decision,
      decisionRaw,
      name: (r[COL_NAME] ?? '').trim(),
      playerType: (r[COL_PLAYER_TYPE] ?? '').trim(),
      timeZone: (r[COL_TIME_ZONE] ?? '').trim(),
      row: i + 1,
    });
  }

  return NextResponse.json({
    rows,
    counts,
    fetchedAt: new Date().toISOString(),
    sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}`,
  });
}
