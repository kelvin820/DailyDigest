// Kept for existing handoff instructions; implementation uses loopback HTTP.
import('./qa-offline.mjs').catch(error => { console.error(error); process.exitCode = 1; });
