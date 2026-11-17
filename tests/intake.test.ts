import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeFacts, sourceSchema, type Evidence } from '../lib/pipeline/intake';
import type { TextModelProvider } from '../lib/providers/text';

// Synthetic transports and models; these tests never fetch/publish real articles.
const categories = ['world', 'business', 'technology', 'culture', 'nature', 'science', 'technology', 'nature'] as const;
const evidence: Evidence[] = Array.from({ length: 10 }, (_, i) => ({ id: 'candidate-' + i,
  source_id: 'source-' + i, source_name: 'Source ' + i, canonical_url: `https://source-${i}.example/item`,
  title: 'Synthetic test report ' + i, published_at: '2026-11-17T00:00:00Z',
  independence_group: 'independent-' + i, evidence: ('Synthetic source ' + i + ' describes a local plan with uncertainty. ').repeat(8),
  read_at: '2026-11-17T01:00:00Z', rights_reviewed: true, content_hash: 'test-' + i }));
const registry = evidence.map(e => sourceSchema.parse({ name: e.source_name, domain: new URL(e.canonical_url).hostname,
  feed_urls: [], categories: ['science'], status: 'enabled', discovery_enabled: true, fetch_enabled: true,
  rewrite_policy: 'allowed', reviewed_at: '2026-11-17', evidence_policy: 'permanent_excerpt' }));
const stories = categories.map((category, i) => ({ candidate_ids: ['candidate-' + i,
  ...(i < 2 ? ['candidate-' + (i + 8)] : [])], event_key: 'event-' + i, category, content_kind: 'news', update_reason: null }));
const collect = async () => ({ evidence, failures: [] });
function fixtureProvider(invalidQuote = false) {
  let calls = 0;
  const provider: TextModelProvider = { async generateStructured(input) {
    calls++;
    let response: unknown = { status: 'selected', stories };
    if (input.task === 'facts') {
      const data = input.data as { sources: { source_id: string; evidence: string }[] };
      response = { claims: [{ claim_id: 'core', text: 'An attributed synthetic plan exists.',
        supporting_source_ids: data.sources.map(s => s.source_id), evidence_ref: data.sources[0].source_id,
        status: 'reported_plan', must_keep: true }], event_date: null, uncertainties: ['This is a plan, not completed work.'],
        sensitivity: 'low', evidence_quotes: data.sources.map(s => ({ source_id: s.source_id,
          quote: invalidQuote ? 'Invented evidence that never appears in any supplied source.' : s.evidence.slice(0, 100) })) };
    }
    return { data: input.schema.parse(response), usage: { input_tokens: 0, output_tokens: 0 } };
  } };
  return { provider, calls: () => calls };
}
function store() { const map = new Map<string, unknown>(); return { get: async (key: string) => map.get(key),
  set: async (key: string, value: unknown) => { map.set(key, value); } }; }

test('intake joins only read URLs and verbatim evidence, keeps event date unknown, reuses completed model steps', async () => {
  const mock = fixtureProvider(), checkpoints = store();
  const input = { registry, collect, issueDate: '2026-11-17', history: [], model: 'fixture-nemotron',
    store: checkpoints, provider: mock.provider };
  const result = await intakeFacts(input);
  assert.equal(result.facts.length, 8); assert.equal(mock.calls(), 9);
  for (const fact of result.facts) {
    assert.equal(fact.event_date, null); assert.ok(fact.story_id.startsWith('story-'));
    for (const source of fact.sources) assert.ok(evidence.some(e => e.canonical_url === source.url && e.evidence.includes(source.evidence)));
  }
  await intakeFacts(input); assert.equal(mock.calls(), 9);
});
test('invented quotations, recycled events without updates, and pending rights stop intake', async () => {
  const invalid = fixtureProvider(true);
  await assert.rejects(intakeFacts({ registry, collect, issueDate: '2026-11-17', history: [],
    store: store(), provider: invalid.provider, model: 'fixture' }), /EVIDENCE_QUOTE_NOT_VERBATIM/);
  const duplicate = fixtureProvider();
  await assert.rejects(intakeFacts({ registry, collect, issueDate: '2026-11-17',
    history: [{ event_key: 'event-0', claims: [] }], store: store(), provider: duplicate.provider, model: 'fixture' }), /RECENT_EVENT_DUPLICATE/);
  const pending = fixtureProvider();
  await assert.rejects(intakeFacts({ registry: registry.map(r => ({ ...r, status: 'pending' as const })), collect,
    issueDate: '2026-11-17', history: [], store: store(), provider: pending.provider, model: 'fixture' }), /SOURCE_POLICY_NOT_APPROVED/);
});
