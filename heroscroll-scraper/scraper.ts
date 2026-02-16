import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const HEROSCROLL_URL = "https://www.heroscroll.com/kingdom-compare?rollupType=top400";

interface Kingdom {
  timestamp: string;
  kingdom_id: number;
  power: number;
  troop_power: number;
  killpoints: number;
  deads: number;
  player_count: number;
  ch25_count: number;
  domain_count: number;
  inactive_player_count: number;
  total_rss_given: number;
  total_rss_gathered: number;
  lost_kingdom_most_killed_average: number;
  lost_kingdom_most_lost_average: number;
  rank: number;
  hero_scroll_rating: number;
  scan_tier: string;
  has_heroscrolls: number;
  is_active: number;
  service_level: string | null;
  has_dashboard: number;
}

async function fetchKingdoms(): Promise<Kingdom[]> {
  console.log(`[${new Date().toISOString()}] Fetching heroscroll...`);

  const response = await fetch(HEROSCROLL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const html = await response.text();

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) {
    throw new Error("__NEXT_DATA__ not found in page");
  }

  const nextData = JSON.parse(match[1]);
  const kingdoms: Kingdom[] = nextData?.props?.pageProps?.kingdoms;

  if (!kingdoms || !Array.isArray(kingdoms)) {
    throw new Error("kingdoms array not found in __NEXT_DATA__");
  }

  console.log(`Found ${kingdoms.length} kingdoms`);
  return kingdoms;
}

async function saveToSupabase(kingdoms: Kingdom[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const rows = kingdoms.map((k) => ({
    scraped_at: new Date().toISOString(),
    data_timestamp: k.timestamp,
    kingdom_id: k.kingdom_id,
    rank: k.rank,
    power: k.power,
    troop_power: k.troop_power,
    killpoints: k.killpoints,
    deads: k.deads,
    hero_scroll_rating: k.hero_scroll_rating,
    player_count: k.player_count,
    ch25_count: k.ch25_count,
    inactive_player_count: k.inactive_player_count,
    domain_count: k.domain_count,
    total_rss_given: k.total_rss_given,
    total_rss_gathered: k.total_rss_gathered,
    lost_kingdom_most_killed_average: k.lost_kingdom_most_killed_average,
    lost_kingdom_most_lost_average: k.lost_kingdom_most_lost_average,
    scan_tier: k.scan_tier,
    has_heroscrolls: k.has_heroscrolls === 1,
    is_active: k.is_active === 1,
    service_level: k.service_level,
    has_dashboard: k.has_dashboard === 1,
  }));

  const { error, count } = await supabase
    .from("heroscroll_snapshots")
    .insert(rows, { count: "exact" });

  if (error) {
    throw new Error(`Supabase insert error: ${JSON.stringify(error)}`);
  }

  console.log(`Inserted ${count ?? rows.length} rows into heroscroll_snapshots`);
}

async function main(): Promise<void> {
  try {
    const kingdoms = await fetchKingdoms();
    await saveToSupabase(kingdoms);
    console.log("Done ✓");
  } catch (err) {
    console.error("ERROR:", (err as Error).message);
    process.exit(1);
  }
}

main();
