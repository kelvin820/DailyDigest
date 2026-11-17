import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFetch } from '../lib/content/safe-fetch.mjs';
import { checkRobots, parseFeed } from '../lib/content/sources.mjs';
import { setTimeout } from 'node:timers/promises';

// Diagnostic reads of configured public candidate feeds/terms. Never enables a source,
// stores full articles, calls a model, or treats connectivity as permission to rewrite.
const registry = JSON.parse(await readFile('config/sources.json', 'utf8'));
const report = { observedAt: new Date().toISOString(), mode: 'read-only-source-audit',
  liveIssuePublished: false, sourcePoliciesChanged: false, observations: [] };
for (const source of registry) {
  const observation = { source: source.name, policy: source.rewrite_policy,
    approval: 'pending-human-rights-review', checks: [] };
  const urls = [source.terms_url, ...source.feed_urls.slice(0, 1)].filter(Boolean);
  for (const url of urls) {
    const domains = [...new Set([source.domain, new URL(source.terms_url).hostname,
      ...(source.feed_domains || [])])];
    try {
      const robots = await checkRobots(url, domains);
      await setTimeout(1000);
      const result = await safeFetch(url, domains);
      const isFeed = source.feed_urls.includes(url);
      observation.checks.push({ url, finalUrl: result.url, status: 'fetched', robots,
        observedAt: new Date().toISOString(), mime: result.mime, bytes: result.bytes.length,
        sha256: createHash('sha256').update(result.bytes).digest('hex'),
        ...(isFeed ? { recentCandidateCount: parseFeed(result.text, source).length } : {}) });
    } catch (error) {
      observation.checks.push({ url, status: 'failed', observedAt: new Date().toISOString(),
        code: /^[A-Z0-9_:.-]{1,100}$/.test(error.message) ? error.message :
          /^[A-Z0-9_]{1,100}$/.test(error.code || '') ? error.code : 'NETWORK_OR_TLS_FAILED' });
    }
  }
  report.observations.push(observation);
  console.log(source.name + ': ' + observation.checks.map(c => c.status).join(', '));
}
await mkdir('output', { recursive: true });
await writeFile('output/source-audit.json', JSON.stringify(report, null, 2));
console.log('Audit saved. Rights remain pending; no live publication or model calls.');
