import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy to https://www.heroscroll.com/api/kingdoms/get-kingdoms
// because the upstream API doesn't return CORS headers usable from the
// browser. Cached for 60s so repeated visits don't hammer Heroscroll.
//
// Accepts the same JSON payload as the upstream (currently `{ rollupType: "top400" }`)
// and forwards it. Only `rollupType` is whitelisted to avoid being weaponized
// as an open proxy.

const ALLOWED_ROLLUP_TYPES = new Set(['top400']);

export async function POST(request: NextRequest) {
  let payload: { rollupType?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const rollupType = payload?.rollupType ?? 'top400';
  if (!ALLOWED_ROLLUP_TYPES.has(rollupType)) {
    return NextResponse.json({ error: `Unsupported rollupType: ${rollupType}` }, { status: 400 });
  }

  try {
    const upstream = await fetch('https://www.heroscroll.com/api/kingdoms/get-kingdoms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Some upstreams reject fetches without a UA; pose as a normal browser
        // since this endpoint is meant to be hit from heroscroll.com itself.
        'User-Agent': 'Mozilla/5.0 (compatible; rok-suite/1.0)',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.heroscroll.com',
        'Referer': 'https://www.heroscroll.com/',
      },
      body: JSON.stringify({ rollupType }),
      next: { revalidate: 60 },
    });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      console.warn('Heroscroll non-2xx response', upstream.status, body.slice(0, 500));
      return NextResponse.json(
        { error: `Heroscroll returned ${upstream.status}`, body: body.slice(0, 500) },
        { status: 502 },
      );
    }
    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('Heroscroll proxy failed', err);
    return NextResponse.json({ error: 'Failed to reach Heroscroll' }, { status: 502 });
  }
}
