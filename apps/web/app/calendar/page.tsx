'use client';

import { useState } from 'react';
import Link from 'next/link';

// Google Calendar configuration
const CALENDARS = [
    {
        id: 'e1ef35a9b7dd39094f70f7065b2c20e86685b9f7e1e62f17030298d0a3bbedca@group.calendar.google.com',
        name: 'Angmar Alliance Events',
        color: '#0B8043', // green (inverts to a nice coral/red)
        displayColor: '#F56565', // what we show in UI
    },
    {
        id: '998f5eb195b2ac2ef4e4e65d9ccc3255c6bfcec5a65634f0c08b1ee8017d8523@group.calendar.google.com',
        name: 'RoK Events',
        color: '#039BE5', // blue (inverts to a warm orange)
        displayColor: '#ED8936', // what we show in UI
    },
];

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

export default function CalendarPage() {
    const [timezone, setTimezone] = useState('UTC');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [showSubscribe, setShowSubscribe] = useState(false);
    const [enabledCalendars, setEnabledCalendars] = useState<Set<number>>(new Set([0, 1]));

    const toggleCalendar = (index: number) => {
        const newEnabled = new Set(enabledCalendars);
        if (newEnabled.has(index)) {
            if (newEnabled.size > 1) {
                newEnabled.delete(index);
            }
        } else {
            newEnabled.add(index);
        }
        setEnabledCalendars(newEnabled);
    };

    const copyToClipboard = async (url: string, index: number) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
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
    };

    // Build calendar URL with multiple sources
    const enabledCalendarsList = CALENDARS.filter((_, i) => enabledCalendars.has(i));
    const calendarSources = enabledCalendarsList
        .map(cal => `src=${encodeURIComponent(cal.id)}&color=${encodeURIComponent(cal.color)}`)
        .join('&');
    const calendarUrl = `https://calendar.google.com/calendar/embed?${calendarSources}&ctz=${encodeURIComponent(timezone)}&showTitle=0&showNav=1&showPrint=0&showCalendars=0&mode=MONTH`;

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
                {/* Calendar toggles */}
                <div className="flex flex-wrap justify-center gap-3 mb-4">
                    {CALENDARS.map((cal, index) => (
                        <button
                            key={cal.id}
                            onClick={() => toggleCalendar(index)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                enabledCalendars.has(index)
                                    ? 'bg-white/10 text-white border border-white/20'
                                    : 'bg-white/5 text-[#a0aec0] border border-white/10 opacity-60'
                            }`}
                        >
                            <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: cal.displayColor }}
                            />
                            {cal.name}
                            {enabledCalendars.has(index) && (
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>

                {/* Subscribe button */}
                <div className="flex justify-center mb-6">
                    <button
                        onClick={() => setShowSubscribe(!showSubscribe)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${theme.buttonPrimary} flex items-center gap-2`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        {showSubscribe ? 'Hide Subscribe Options' : 'Subscribe to Calendars'}
                    </button>
                </div>

                {/* Subscribe panel */}
                {showSubscribe && (
                    <div className={`${theme.card} border rounded-xl p-4 mb-6`}>
                        <h3 className="text-lg font-semibold mb-4 text-center">Subscribe to Calendars</h3>
                        <p className={`text-xs ${theme.textMuted} text-center mb-4`}>Choose which calendars to add to your calendar app</p>

                        <div className="space-y-4">
                            {CALENDARS.map((cal, index) => {
                                const icalUrl = `https://calendar.google.com/calendar/ical/${cal.id}/public/basic.ics`;
                                return (
                                    <div key={cal.id} className={`p-4 rounded-lg border ${theme.border}`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: cal.displayColor }}
                                            />
                                            <h4 className="font-medium">{cal.name}</h4>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            {/* Google Calendar */}
                                            <div>
                                                <p className={`text-xs ${theme.textMuted} mb-2`}>Google Calendar</p>
                                                <a
                                                    href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(cal.id)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`inline-block px-3 py-2 rounded-lg text-xs font-medium ${theme.button}`}
                                                >
                                                    Add to Google Calendar
                                                </a>
                                            </div>

                                            {/* iCal URL */}
                                            <div>
                                                <p className={`text-xs ${theme.textMuted} mb-2`}>Apple / Outlook / Other</p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={icalUrl}
                                                        readOnly
                                                        className={`flex-1 px-2 py-2 rounded-lg text-xs ${theme.button} bg-[#0f1535] font-mono truncate min-w-0`}
                                                    />
                                                    <button
                                                        onClick={() => copyToClipboard(icalUrl, index)}
                                                        className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${copiedIndex === index ? 'bg-green-600 text-white' : theme.button}`}
                                                    >
                                                        {copiedIndex === index ? 'Copied!' : 'Copy'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/10 text-center">
                            <p className={`text-xs ${theme.textMuted}`}>
                                For Apple Calendar / Outlook: Use <span className="text-white">File → New Calendar Subscription</span> and paste the URL
                            </p>
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
                        key={`${timezone}-${Array.from(enabledCalendars).join('-')}`}
                        src={calendarUrl}
                        style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg)' }}
                        width="100%"
                        height="600"
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
