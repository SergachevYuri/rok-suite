// Centralized password config — reads from environment variables.
// Set NEXT_PUBLIC_ADMIN_PASSWORD, NEXT_PUBLIC_OFFICER_PASSWORD, and
// NEXT_PUBLIC_POWER_PASSWORD in your .env.local file.

export const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';
export const OFFICER_PASSWORD = process.env.NEXT_PUBLIC_OFFICER_PASSWORD || '';
export const POWER_PASSWORD = process.env.NEXT_PUBLIC_POWER_PASSWORD || '';
