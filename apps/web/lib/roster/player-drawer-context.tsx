'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface PlayerDrawerContextValue {
    /** The player name currently open in the drawer, or null if closed */
    openPlayerName: string | null;
    /** Open the drawer for a player by name */
    openPlayer: (name: string) => void;
    /** Close the drawer */
    closePlayer: () => void;
}

const PlayerDrawerContext = createContext<PlayerDrawerContextValue | null>(null);

export function usePlayerDrawer() {
    const ctx = useContext(PlayerDrawerContext);
    if (!ctx) throw new Error('usePlayerDrawer must be used within PlayerDrawerProvider');
    return ctx;
}

export function PlayerDrawerProvider({ children }: { children: React.ReactNode }) {
    const [openPlayerName, setOpenPlayerName] = useState<string | null>(null);

    const openPlayer = useCallback((name: string) => {
        setOpenPlayerName(name);
    }, []);

    const closePlayer = useCallback(() => {
        setOpenPlayerName(null);
    }, []);

    return (
        <PlayerDrawerContext.Provider value={{ openPlayerName, openPlayer, closePlayer }}>
            {children}
        </PlayerDrawerContext.Provider>
    );
}
