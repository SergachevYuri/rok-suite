'use client';

import { useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { AppSidebar } from '@/components/AppSidebar';

// Google Calendar configuration
const PUBLIC_CALENDARS = [
    {
        id: '2aed069b30c3f3501b64ef982441f597b833e3db8b855488f734efe1b9552040@group.calendar.google.com',
        name: 'Angmar Alliance',
        color: '#D50000', // red
        displayColor: '#ef4444', // red
    },
    {
        id: 'e1ef35a9b7dd39094f70f7065b2c20e86685b9f7e1e62f17030298d0a3bbedca@group.calendar.google.com',
        name: 'Kingdom 23',
        color: '#039BE5', // blue
        displayColor: '#3b82f6', // blue
    },
    {
        id: 'd005a7955410ff8b21164034320d73e20fad0124e59617077234e6b15aae0577@group.calendar.google.com',
        name: 'ROK Events',
        color: '#7986CB', // purple
        displayColor: '#8b5cf6', // violet
    },
];

const ADMIN_CALENDAR = {
    id: 'ef47386caa3f7c72112843b965a4db91dc20c1b785836db69b064bf49a50aede@group.calendar.google.com',
    name: 'Leadership',
    color: '#0B8043', // green
    displayColor: '#22c55e', // green
};

import { ADMIN_PASSWORD } from '@/lib/auth-passwords';

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
    const { theme: currentTheme } = useTheme();
    const [timezone, setTimezone] = useState('UTC');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [showSubscribe, setShowSubscribe] = useState(false);
    const [enabledCalendars, setEnabledCalendars] = useState<Set<number>>(new Set([0, 1, 2])); // Default to all public calendars
    const [isAdmin, setIsAdmin] = useState(false);
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState(false);

    // Combine public + admin calendars based on login state
    const CALENDARS = isAdmin ? [...PUBLIC_CALENDARS, ADMIN_CALENDAR] : PUBLIC_CALENDARS;

    const handleAdminLogin = () => {
        if (password === ADMIN_PASSWORD) {
            setIsAdmin(true);
            setShowPasswordPrompt(false);
            setPassword('');
            setPasswordError(false);
            // Auto-enable the leadership calendar
            setEnabledCalendars(prev => new Set([...prev, PUBLIC_CALENDARS.length]));
        } else {
            setPasswordError(true);
        }
    };

    const handleAdminLogout = () => {
        setIsAdmin(false);
        // Remove admin calendar from enabled set
        setEnabledCalendars(prev => {
            const next = new Set(prev);
            next.delete(PUBLIC_CALENDARS.length);
            return next;
        });
    };

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

    // Theme with CSS variables for dark/light mode support
    const theme = {
        bg: 'bg-[var(--background)]',
        card: 'bg-[var(--background-card)] border-[var(--border)] backdrop-blur-xl',
        text: 'text-[var(--foreground)]',
        textMuted: 'text-[var(--text-secondary)]',
        border: 'border-[var(--border)]',
        button: 'bg-[var(--background-card)] hover:opacity-80 text-[var(--foreground)] border border-[var(--border)]',
        buttonPrimary: 'bg-gradient-to-r from-[#f56565] to-[#ed8936] hover:opacity-90 text-white',
    };

    // Build calendar URL with multiple sources
    const enabledCalendarsList = CALENDARS.filter((_, i) => enabledCalendars.has(i));
    const calendarSources = enabledCalendarsList
        .map(cal => `src=${encodeURIComponent(cal.id)}&color=${encodeURIComponent(cal.color)}`)
        .join('&');
    const calendarUrl = `https://calendar.google.com/calendar/embed?${calendarSources}&ctz=${encodeURIComponent(timezone)}&showTitle=0&showNav=1&showPrint=0&showCalendars=0&mode=AGENDA`;

    return (
        <AppSidebar>
        <div className={`min-h-screen ${theme.bg} ${theme.text}`}>
            {/* Header */}
            <header className="bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-14 lg:top-0 z-30">
                <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-rose-500/15">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Event Calendar</h1>
                                <p className="text-xs sm:text-sm text-[var(--text-secondary)] hidden sm:block">Kingdom 23 events and Angmar alliance activities</p>
                            </div>
                        </div>
                        {isAdmin ? (
                            <button
                                onClick={handleAdminLogout}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25 transition-colors flex items-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                </svg>
                                Admin
                            </button>
                        ) : (
                            <button
                                onClick={() => setShowPasswordPrompt(true)}
                                className={`p-2 rounded-lg transition-colors ${theme.button} opacity-40 hover:opacity-70`}
                                title="Admin login"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Admin password modal */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowPasswordPrompt(false); setPassword(''); setPasswordError(false); }}>
                    <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                            <h3 className="text-lg font-semibold">Admin Login</h3>
                        </div>
                        <p className={`text-xs ${theme.textMuted} mb-4`}>Enter the admin password to view leadership calendars.</p>
                        <form onSubmit={e => { e.preventDefault(); handleAdminLogin(); }}>
                            <input
                                type="password"
                                value={password}
                                onChange={e => { setPassword(e.target.value); setPasswordError(false); }}
                                placeholder="Password"
                                autoFocus
                                className={`w-full px-3 py-2 rounded-lg text-sm bg-[var(--background)] border ${passwordError ? 'border-red-500' : 'border-[var(--border)]'} text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-violet-500`}
                            />
                            {passwordError && <p className="text-xs text-red-400 mt-1">Incorrect password</p>}
                            <div className="flex gap-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowPasswordPrompt(false); setPassword(''); setPasswordError(false); }}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${theme.button}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                                >
                                    Login
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto p-4 md:p-6">
                {/* Calendar toggles */}
                <div className="flex flex-wrap justify-center gap-3 mb-4">
                    {CALENDARS.map((cal, index) => (
                        <button
                            key={cal.id}
                            onClick={() => toggleCalendar(index)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                enabledCalendars.has(index)
                                    ? 'bg-[var(--background-secondary)] text-[var(--foreground)] border border-[var(--border)]'
                                    : 'bg-[var(--background-card)] text-[var(--text-secondary)] border border-[var(--border)] opacity-60'
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
                        className="px-4 py-2.5 rounded-lg text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        {showSubscribe ? 'Hide Subscribe Options' : 'Subscribe to Calendars'}
                    </button>
                </div>

                {/* Subscribe panel */}
                {showSubscribe && (
                    <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] rounded-xl p-4 mb-6">
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
                                                        className={`flex-1 px-2 py-2 rounded-lg text-xs ${theme.button} bg-[var(--background)] font-mono truncate min-w-0`}
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

                        <div className="mt-4 pt-4 border-t border-[var(--border)] text-center">
                            <p className={`text-xs ${theme.textMuted}`}>
                                For Apple Calendar / Outlook: Use <span className="text-[var(--foreground)]">File → New Calendar Subscription</span> and paste the URL
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
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${theme.button} bg-[var(--background)] cursor-pointer`}
                    >
                        {TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                                {tz.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Calendar embed - inverted for dark mode */}
                <div className="bg-[var(--background-card)] border border-[var(--border)] shadow-[var(--card-shadow)] rounded-xl overflow-hidden">
                    <iframe
                        key={`${timezone}-${Array.from(enabledCalendars).join('-')}-${currentTheme}`}
                        src={calendarUrl}
                        style={{ border: 0, filter: currentTheme === 'dark' ? 'invert(0.9) hue-rotate(180deg)' : 'none' }}
                        width="100%"
                        height="600"
                        className="rounded-lg"
                    />
                </div>

                <p className={`text-center text-xs ${theme.textMuted} mt-4`}>
                    Times shown in {TIMEZONE_OPTIONS.find(tz => tz.value === timezone)?.label || timezone}
                </p>

                <footer className={`mt-8 pt-4 border-t ${theme.border} text-center space-y-1`}>
                    <p className={`text-xs ${theme.textMuted}`}>Kingdom 23 • Rise of Kingdoms</p>
                    <p className={`text-[10px] ${theme.textMuted} opacity-50`}>Subscribe to get event reminders in your calendar app</p>
                    <p className={`text-[10px] ${theme.textMuted} opacity-50`}>
                        ROK Events calendar sourced from{' '}
                        <a href="https://rokcentral.com/calendar/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--foreground)] transition-colors">rokcentral.com</a>
                    </p>
                </footer>
            </div>
        </div>
        </AppSidebar>
    );
}
