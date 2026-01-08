'use client';

import Link from 'next/link';

// Google Calendar configuration
const GOOGLE_CALENDAR_ID = 'e1ef35a9b7dd39094f70f7065b2c20e86685b9f7e1e62f17030298d0a3bbedca@group.calendar.google.com';

export default function CalendarPage() {
    const theme = {
        bg: 'bg-[#0f1535]',
        card: 'bg-[rgba(6,11,40,0.94)] border-white/10 backdrop-blur-xl',
        text: 'text-white',
        textMuted: 'text-[#a0aec0]',
        border: 'border-white/10',
        button: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
        buttonPrimary: 'bg-gradient-to-r from-[#f56565] to-[#ed8936] hover:opacity-90 text-white',
    };

    return (
        <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
            {/* Grid background */}
            <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

            {/* Header */}
            <header className="bg-[#0f1535]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40">
                <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className={`p-2 rounded-lg ${theme.button} hover:opacity-80 transition-opacity`}
                                title="Back to Home"
                            >
                                ←
                            </Link>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alliance Calendar</h1>
                                <p className={`text-sm ${theme.textMuted}`}>Upcoming events for Angmar</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-5xl mx-auto p-4 md:p-6">
                {/* Subscribe buttons */}
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                    <a
                        href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(GOOGLE_CALENDAR_ID)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.buttonPrimary} flex items-center gap-2`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        Add to Google Calendar
                    </a>
                    <a
                        href={`https://calendar.google.com/calendar/ical/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/public/basic.ics`}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.button} flex items-center gap-2`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                        Download iCal (Apple/Outlook)
                    </a>
                </div>

                {/* Calendar embed - dark mode */}
                <div className={`${theme.card} border rounded-xl overflow-hidden`}>
                    <iframe
                        src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(GOOGLE_CALENDAR_ID)}&ctz=America%2FNew_York&showTitle=0&showNav=1&showPrint=0&showCalendars=0&mode=AGENDA&bgcolor=%230f1535&color=%2301b574`}
                        style={{ border: 0 }}
                        width="100%"
                        height="600"
                        frameBorder="0"
                        scrolling="no"
                        className="rounded-lg"
                    />
                </div>

                <p className={`text-center text-xs ${theme.textMuted} mt-4`}>
                    Times shown in Eastern Time (America/New_York)
                </p>

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                    <p className={`text-xs ${theme.textMuted}`}>Angmar • Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>Subscribe to get event reminders</p>
                </footer>
            </div>
        </div>
    );
}
