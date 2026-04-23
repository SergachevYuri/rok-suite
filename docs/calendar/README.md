# Calendar

A shared event calendar for the alliance and kingdom, embedding Google Calendar feeds directly in the app so members don't need to leave to see what's coming up.

**Live:** [/calendar](https://rok-suite-web.vercel.app/calendar)

## What's in it

- **Three public calendars** — Angmar Alliance, Kingdom 23, and global ROK Events — rendered as colored event dots on a single combined view
- **Leadership calendar** — a fourth officer-only calendar unlocked with the admin password
- **Multi-timezone support** — UTC (in-game time), US Eastern/Central/Mountain/Pacific, Brazil, UK, Europe, Asia-Pacific, Australia; the selected timezone persists locally
- **iCal subscription URLs** — copy a `webcal://` URL to subscribe from Apple Calendar, Outlook, or any standards-compliant client

## Typical flow

1. Set your timezone from the top-right dropdown (UTC is game time)
2. Browse upcoming events across the three public calendars
3. Officers: unlock the Leadership calendar with the admin password
4. Copy an iCal URL to subscribe from your personal calendar app

## Admin

Admins can add events directly in Google Calendar — the changes propagate to the app automatically. There is no in-app editor; the calendar IDs are hard-coded in the page source.
