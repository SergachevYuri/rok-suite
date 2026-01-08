'use client';

import { useState } from 'react';
import Link from 'next/link';

// Google Calendar configuration
const GOOGLE_CALENDAR_ID = 'e1ef35a9b7dd39094f70f7065b2c20e86685b9f7e1e62f17030298d0a3bbedca@group.calendar.google.com';

const TIMEZONE_OPTIONS = [
    { value: 'UTC', label: 'UTC (Game Time)' },
    { value: 'America/New_York', label: 'US Eastern' },
    { value: 'America/Los_Angeles', label: 'US Pacific' },
    { value: 'Europe/London', label: 'UK' },
    { value: 'Europe/Paris', label: 'Central Europe' },
    { value: 'Asia/Tokyo', label: 'Japan' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Australia/Sydney', label: 'Australia' },
];

const ICAL_URL = `https://calendar.google.com/calendar/ical/${GOOGLE_CALENDAR_ID}/public/basic.ics`;

export default function CalendarPage() {
    const [timezone, setTimezone] = useState('UTC');
    const [copied, setCopied] = useState(false);
    const [showSubscribe, setShowSubscribe] = useState(false);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(ICAL_URL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = ICAL_URL;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const theme = {
        bg: 'bg-[#0f1535]',
        card: 'bg-[rgba(6,11,40,0.94)] border-white/10 backdrop-blur-xl',
        text: 'text-white',
        textMuted: 'text-[#a0aec0]',
        border: 'border-white/10',
        button: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
        buttonPrimary: 'bg-gradient-to-r from-[#f56565] to-[#ed8936] hover:opacity-90 text-white',
        tabActive: 'bg-white/10 text-white',
        tabInactive: 'bg-transparent text-[#a0aec0] hover:bg-white/5',
    };

    const calendarUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(GOOGLE_CALENDAR_ID)}&ctz=${encodeURIComponent(timezone)}&showTitle=0&showNav=1&showPrint=0&showCalendars=0&mode=MONTH`;

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
                {/* Subscribe button */}
                <div className="flex justify-center mb-6">
                    <button
                        onClick={() => setShowSubscribe(!showSubscribe)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.buttonPrimary} flex items-center gap-2`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        {showSubscribe ? 'Hide Subscribe Options' : 'Subscribe to Calendar'}
                    </button>
                </div>

                {/* Subscribe panel */}
                {showSubscribe && (
                    <div className={`${theme.card} border rounded-xl p-4 mb-6`}>
                        <h3 className="text-lg font-semibold mb-4 text-center">Subscribe to this Calendar</h3>

                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Google Calendar */}
                            <div className={`p-4 rounded-lg border ${theme.border}`}>
                                <h4 className="font-medium mb-2">Google Calendar</h4>
                                <p className={`text-xs ${theme.textMuted} mb-3`}>Click to add directly to your Google Calendar</p>
                                <a
                                    href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(GOOGLE_CALENDAR_ID)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-block px-3 py-2 rounded-lg text-sm font-medium ${theme.button}`}
                                >
                                    Add to Google Calendar
                                </a>
                            </div>

                            {/* Apple Calendar / Other */}
                            <div className={`p-4 rounded-lg border ${theme.border}`}>
                                <h4 className="font-medium mb-2">Apple Calendar / Outlook / Other</h4>
                                <p className={`text-xs ${theme.textMuted} mb-3`}>
                                    Copy the URL below and paste it in:<br/>
                                    <span className="text-white">File → New Calendar Subscription</span>
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={ICAL_URL}
                                        readOnly
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs ${theme.button} bg-[#0f1535] font-mono truncate`}
                                    />
                                    <button
                                        onClick={copyToClipboard}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium ${copied ? 'bg-green-600 text-white' : theme.button}`}
                                    >
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Download option */}
                        <div className="mt-4 pt-4 border-t border-white/10 text-center">
                            <p className={`text-xs ${theme.textMuted} mb-2`}>Or download as a one-time import (won't auto-update):</p>
                            <a
                                href={ICAL_URL}
                                className={`inline-block px-3 py-2 rounded-lg text-sm font-medium ${theme.button}`}
                            >
                                Download .ics file
                            </a>
                        </div>
                    </div>
                )}

                {/* Timezone selector */}
                <div className="flex justify-center items-center gap-2 mb-4">
                    <span className={`text-sm ${theme.textMuted}`}>Timezone:</span>
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} bg-[#0f1535] cursor-pointer`}
                    >
                        {TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                                {tz.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Calendar embed - inverted for dark mode */}
                <div className={`${theme.card} border rounded-xl overflow-hidden`}>
                    <iframe
                        key={timezone}
                        src={calendarUrl}
                        style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg)' }}
                        width="100%"
                        height="600"
                        frameBorder="0"
                        scrolling="no"
                        className="rounded-lg"
                    />
                </div>

                <p className={`text-center text-xs ${theme.textMuted} mt-4`}>
                    Times shown in {TIMEZONE_OPTIONS.find(tz => tz.value === timezone)?.label || timezone}
                </p>

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center`}>
                    <p className={`text-xs ${theme.textMuted}`}>Angmar • Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} mt-1 opacity-50`}>Subscribe to get event reminders</p>
                </footer>
            </div>
        </div>
    );
}
