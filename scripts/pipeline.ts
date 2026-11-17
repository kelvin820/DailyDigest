import { mkdir, writeFile } from 'node:fs/promises';
import { taipeiDate, validDate } from '../lib/content/metrics';

if (process.env.LIVE_GENERATION_ENABLED !== 'true') {
  const date = process.env.ISSUE_DATE || taipeiDate();
  if (!validDate(date)) throw Error('INVALID_DATE');
  await import('./offline.mjs');
  await mkdir('.runtime', { recursive: true });
  await writeFile('.runtime/job-status.json', JSON.stringify({ requestedIssueDate: date,
    fixtureIssueDate: '2026-11-17', status: 'demo_only', published: false, live: false }));
  console.log('DEMO only; fixture date stays 2026-11-17. No model calls or publication.');
} else {
  await import('./run-worker');
}
