// A 'use server' file (app/actions.ts) can only export async functions --
// Next.js rejects any other export at build time -- so this marker, shared
// between actions.ts's error message and VideoProcessingPanel.tsx's "Copy
// split command" button visibility check, lives in its own plain module
// instead (plan-eng-review, 2026-09-28).
export const SIZE_REJECTION_MARKER = 'too large'
