// One-shot: compare a provided name list against the currently flagged emigration list
// and the latest DKP dataset. Usage: node scripts/cross-check-flagged.mjs
//
// Emits three groups:
//   ✓ flagged     — name found in dataset and present in flaggedForMigration
//   ✗ not flagged — name found in dataset but NOT in flaggedForMigration
//   ? not found   — name not in the current scan at all
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Minimal .env.local parser — avoids pulling dotenv into scripts that run outside Next.
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY'); process.exit(1); }
const supabase = createClient(url, key);

const MIGRATION_ROW_ID = 'migration';

const NAMES = `Halah Asu
ᵖˢ xHokagee
ᴬʷDrNefario
What The heill
Yterb
jaclass
BEYAZID 55
ᵀᴼsiampa
TVRI mongos
jokowi dodoo
UmutChan
Legen21
calypsux
吉祥如意
Zloy1
Kafziel
SaNtA CLaus
ᵃⁿᵍCowl
Sinh ngo
AlEx997
ᵃⁿᵍXtelli
DaniloLunaRocky
Sunman420
king rakha
Bshusttt
ᵃⁿᵍKaiLey
saskii
Namvu
reeeldid
モニタリング
ᵃⁿᵍAHMET
ChronosRex
Dungeon ruler
ᴵᴺᴳNekat
KevinKwon90
AlpArslan1071
ZFR5339
KNG Wolf9514
Kundakci16
Cartel 44
yxqrs575
Trini Vengeance
Qwerx130
執政官210368524
mng patagoak
Tiger 7
ᵃⁿᵍKomVD2
KouSmiNaS
Fizryk3
Pocc
Wallerun I
ᵃⁿᵍCain
ᶲ Puteh
Barba alba
ᵃⁿᵍMONTAN
xiaomei
ᵐⁿᵍJMLP31
ㅅㄱㅇ asdfghjkl
ккDaxzXxz
ちゃんなお
ᵛᵒMavryk33
ᵃⁿᵍGiulia
ᵃⁿᵍJilsss
Queen Moley
Jay Diggs
ᵃⁿᵍNotor
DaRkNatO
Serelis
PђสRสøђ
ᵐⁿᵍyigitl
ᵏᵏFrifaa
Narutoo
ᴷᴺᴳTomb
DD KARA SABUTAY
T  R  A  P
AOV1985AOV
Madukara
ᴼᵀᶠ NooB
nasubin
Linkkk
ᵃⁿᵍFRUKAN
ᴬ KsSasha
ᵃⁿᵍNightS
Texas07F3
Naberya
MCDragoon
ᵏᵏ John117
ᵃⁿᵍLele
zyya
Samuel Phan
Etrama D Raizel
Luk3s
0erenn
Givnofks
xFACAx
ᴍɴɢBryanV
Donjon 3923
QUADBREED
ᵃⁿᵍVael
ᴿᵁDark亗
ᴵᴺᴳSakai
Луноход
ᴍɴɢ TURBO
ななせ
BINH F2P
ᴵᴺᴳ Tobin
xx Coconut xx
Cutieepiee
ReaperXxX
ⁿᵍPALESTINE
KING IZZY 1
ккYenNhicutee
ᵃⁿᵍNàng
кк REKT
BlueLemon88
ᴍɴɢズMouse
ᵃⁿᵍRaijin
ᵏⁿᵍZdrawe
Darkwitch
豆しば
ᴼᵀᶠ Enma
ᵃⁿᵍGouv
ᵃⁿᵍUGUR
ᵃⁿᵍbear
なるひこ
Armstrong jr XL
Đảo 93
BagueArt69
ᵏᵏMisterSqa
LeuZe
ккMakinalı
Nice Shin 나이스 신
TheEldersx҉ 23
ᵃⁿᵍLapaka
24X҉erencarlsn
mizuki
ᴍɴɢ BASIL
ᵃⁿᵍ Gạo
メHail2Caesar
ᵏᵏHEWO`.split('\n').map((s) => s.trim()).filter(Boolean);

// Normalize: lowercase + collapse whitespace + strip invisible chars. Matches
// the spirit of `looseMatch` in the DKP page without being locale-specific.
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function main() {
  // Latest dataset for the player roster.
  const { data: ds, error: de } = await supabase
    .from('dkp_datasets')
    .select('players, stats_file_name, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (de) throw de;
  if (!ds) { console.error('No dkp_datasets row'); process.exit(1); }

  // Flagged list (array of characterIds).
  const { data: cfg, error: ce } = await supabase
    .from('dkp_config')
    .select('config')
    .eq('id', MIGRATION_ROW_ID)
    .maybeSingle();
  if (ce) throw ce;
  const flagged = new Set(Array.isArray(cfg?.config) ? cfg.config : []);

  console.log(`Dataset: ${ds.stats_file_name} (${new Date(ds.created_at).toLocaleString()})`);
  console.log(`Flagged count: ${flagged.size}`);
  console.log(`Checking ${NAMES.length} input names`);
  console.log();

  const byName = new Map();
  for (const p of ds.players) byName.set(norm(p.username), p);

  const flaggedInList = [];
  const notFlaggedInList = [];
  const notFound = [];
  for (const raw of NAMES) {
    const p = byName.get(norm(raw));
    if (!p) { notFound.push(raw); continue; }
    if (flagged.has(p.characterId)) flaggedInList.push({ raw, p });
    else notFlaggedInList.push({ raw, p });
  }

  const cnt = (a) => String(a.length).padStart(3, ' ');
  console.log(`✓ ${cnt(flaggedInList)}  flagged on site`);
  console.log(`✗ ${cnt(notFlaggedInList)}  NOT flagged on site (in list but not flagged)`);
  console.log(`? ${cnt(notFound)}  NOT FOUND in latest dataset`);
  console.log();

  if (notFlaggedInList.length) {
    console.log('── Not flagged (should they be?) ──');
    for (const { raw, p } of notFlaggedInList) console.log(`  ${raw}   (#${p.characterId}, ${(p.power/1e6).toFixed(1)}M)`);
    console.log();
  }
  if (notFound.length) {
    console.log('── Not found in scan ──');
    for (const raw of notFound) console.log(`  ${raw}`);
    console.log();
  }

  // Reverse check: is anyone flagged on the site who ISN'T in the provided list?
  const listNorm = new Set(NAMES.map(norm));
  const flaggedNotInList = [];
  for (const p of ds.players) {
    if (!flagged.has(p.characterId)) continue;
    if (!listNorm.has(norm(p.username))) flaggedNotInList.push(p);
  }
  if (flaggedNotInList.length) {
    console.log(`── Flagged on site but NOT in list (${flaggedNotInList.length}) ──`);
    for (const p of flaggedNotInList) console.log(`  ${p.username}   (#${p.characterId}, ${(p.power/1e6).toFixed(1)}M)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
