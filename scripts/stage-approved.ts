// Explicit manual-evidence entry point; shares the same durable worker and hard gates.
if (!process.env.APPROVED_FACTS_FILE) throw Error('APPROVED_FACTS_FILE_REQUIRED');
await import('./run-worker');
export {};
