import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_CALENDAR_IDS = new Set([
    '2aed069b30c3f3501b64ef982441f597b833e3db8b855488f734efe1b9552040@group.calendar.google.com',
    'e1ef35a9b7dd39094f70f7065b2c20e86685b9f7e1e62f17030298d0a3bbedca@group.calendar.google.com',
    'd005a7955410ff8b21164034320d73e20fad0124e59617077234e6b15aae0577@group.calendar.google.com',
    'ef47386caa3f7c72112843b965a4db91dc20c1b785836db69b064bf49a50aede@group.calendar.google.com',
]);

export async function GET(request: NextRequest) {
    const calendarId = request.nextUrl.searchParams.get('id');

    if (!calendarId || !ALLOWED_CALENDAR_IDS.has(calendarId)) {
        return NextResponse.json({ error: 'Invalid calendar ID' }, { status: 400 });
    }

    const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;

    try {
        const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
        if (!res.ok) {
            return NextResponse.json({ error: `Google returned ${res.status}` }, { status: 502 });
        }
        const icsText = await res.text();
        return new NextResponse(icsText, {
            headers: { 'Content-Type': 'text/calendar', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
        });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 });
    }
}
