// Centralized password config — reads from environment variables.
// Set NEXT_PUBLIC_ADMIN_PASSWORD and NEXT_PUBLIC_OFFICER_PASSWORD
// in your .env.local file.

export const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';
export const OFFICER_PASSWORD = process.env.NEXT_PUBLIC_OFFICER_PASSWORD || '';
