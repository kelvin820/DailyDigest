import {DAILY_STORY_COUNT} from '../../config/issue-settings.mjs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { discoverSources, fetchCandidate } from '../content/sources.mjs';
import { factSchema, claimSchema } from '../schemas/editorial';
import { httpsUrl } from '../schemas/urls';
import { cachedStep, hash } from './state.mjs';
import type { TextModelProvider } from '../providers/text';
import type { Store } from './editorial';

const categories = ['world', 'business', 'technology', 'culture', 'nature', 'science'] as const;
export const sourceSchema = z.object({ name: z.string(), domain: z.string(), feed_urls: z.array(httpsUrl),
  categories: z.array(z.enum(categories)), status: z.enum(['pending', 'enabled', 'disabled']),
  discovery_enabled: z.boolean(), fetch_enabled: z.boolean(), rewrite_policy: z.enum(['unknown', 'allowed', 'restricted']),
  reviewed_at: z.string().nullable(), evidence_policy: z.enum(['none', 'permanent_excerpt']).default('none'),
}).passthrough();
export type Source = z.infer<typeof sourceSchema>;
const selectionSchemaFor = (storyCount:number) => z.discriminatedUnion('status', [
  z.object({ status: z.literal('insufficient_material'), reason: z.string() }).strict(),
  z.object({ status: z.literal('selected'), stories: z.array(z.object({
    candidate_ids: z.array(z.string()).min(1).max(3), event_key: z.string().min(1),
    category: z.enum(categories), content_kind: z.enum(['news', 'update', 'knowledge']),
    update_reason: z.string().min(1).max(300).nullable(),
  }).strict()).length(storyCount) }).strict(),
]);
const factDraftSchema = z.object({ claims: z.array(claimSchema).min(1), event_date: z.iso.date().nullable(),
  uncertainties: z.array(z.string()), sensitivity: z.enum(['low', 'high']),
  evidence_quotes: z.array(z.object({ source_id: z.string(), quote: z.string().min(30).max(1000) }).strict()).min(1).max(6),
}).strict();
export type Evidence = { id: string; source_id: string; source_name: string; canonical_url: string;
  title: string; published_at: string; independence_group: string; evidence: string;
  read_at: string; rights_reviewed: boolean; content_hash: string };
export type History = { event_key: string; claims: unknown }[];

export async function collectEvidence(registry: Source[],issueDate:string) {
  const eligible = registry.filter(s => s.status === 'enabled' && s.discovery_enabled && s.fetch_enabled &&
    s.rewrite_policy === 'allowed' && s.evidence_policy === 'permanent_excerpt' && s.reviewed_at);
  if (!eligible.length) throw Error('SOURCE_POLICIES_NOT_READY');
  const discovered = await discoverSources(eligible);
  const evidence: Evidence[] = [], failures: { source: string; error: string }[] = [...discovered.failures];
  const cutoff=Math.min(Date.now(),Date.parse(issueDate+'T23:59:59.999+08:00'));
  for (const candidate of discovered.candidates.filter(c=>Date.parse(c.published_at)<=cutoff).slice(0, 30)) {
    const source = eligible.find(s => s.name === candidate.source_name);
    if (!source) continue;
    try { evidence.push(await fetchCandidate(candidate, source)); }
    catch { failures.push({ source: source.name, error: 'ARTICLE_UNAVAILABLE' }); }
  }
  // Full source text stays in memory. Only confirmed verbatim evidence excerpts enter durable facts.
  return { evidence, failures };
}
export async function intakeFacts({ registry, issueDate, history, store, provider, model,
  storyCount=DAILY_STORY_COUNT, collect = () => collectEvidence(registry,issueDate) }: {
  storyCount?:number; registry: Source[]; issueDate: string; history: History; store: Store; provider: TextModelProvider; model: string;
  collect?: () => Promise<{ evidence: Evidence[]; failures: unknown[] }>;
}) {
  const selectionSchema=selectionSchemaFor(storyCount);
  const selectPrompt = (await readFile('prompts/select.v1.txt', 'utf8')).replaceAll('{{story_count}}',String(storyCount));
  const factsPrompt = await readFile('prompts/facts.v1.txt', 'utf8');
  return cachedStep(store, 'intake', { registry, issueDate, history, storyCount, model, selectPrompt, factsPrompt, provider: provider.cacheIdentity }, async () => {
    const { evidence, failures } = await collect();
    if (evidence.length < storyCount) throw Error('INSUFFICIENT_SOURCE_MATERIAL');
    const selectionInput = { issueDate, history, candidates: evidence.map(e => ({ id: e.id,
      title: e.title, published_at: e.published_at, excerpt: e.evidence.slice(0, 1500),
      independence_group: e.independence_group, content_hash: e.content_hash })) };
    const selected = await cachedStep(store, 'select', { ...selectionInput, model, promptVersion: 'select.v1', selectPrompt, provider: provider.cacheIdentity },
      () => provider.generateStructured({ task: 'select', system: selectPrompt, data: selectionInput,
        schema: selectionSchema, model, timeoutMs: 60_000, maxOutputTokens: 3500 }));
    const selection = selectionSchema.parse(selected.data);
    if (selection.status !== 'selected') throw Error('INSUFFICIENT_SOURCE_MATERIAL');
    if (new Set(selection.stories.map(s => s.event_key)).size !== storyCount ||
      new Set(selection.stories.flatMap(s => s.candidate_ids)).size !== selection.stories.flatMap(s => s.candidate_ids).length) {
      throw Error('DUPLICATE_EVENT_OR_SOURCE_SELECTION');
    }
    if (categories.some(category => {
      const n = selection.stories.filter(s => s.category === category).length; return (storyCount===8&&n<1)||n>2;
    }) || (storyCount===4&&new Set(selection.stories.map(s=>s.category)).size<3) || selection.stories.filter(s => s.content_kind === 'knowledge').length > 2) throw Error('CATEGORY_QUOTA_FAILED');
    const bundles: z.infer<typeof factSchema>[] = [];
    for (const story of selection.stories) {
      const sources = story.candidate_ids.map(id => evidence.find(e => e.id === id));
      if (sources.some(s => !s)) throw Error('SELECTED_SOURCE_NOT_READ');
      const read = sources as Evidence[];
      if (read.some(s => !registry.some(r => r.name === s.source_name && r.status === 'enabled' &&
        r.rewrite_policy === 'allowed' && r.evidence_policy === 'permanent_excerpt' && r.reviewed_at))) throw Error('SOURCE_POLICY_NOT_APPROVED');
      if (history.some(h => h.event_key === story.event_key) && (story.content_kind !== 'update' || !story.update_reason)) throw Error('RECENT_EVENT_DUPLICATE');
      const draftInput = { story, sources: read.map(s => ({ source_id: s.id, title: s.title,
        evidence: s.evidence, published_at: s.published_at, independence_group: s.independence_group })) };
      const draftResult = await cachedStep(store, 'facts-' + hash(story.event_key),
        { ...draftInput, model, promptVersion: 'facts.v1', factsPrompt, provider: provider.cacheIdentity }, () => provider.generateStructured({
          task: 'facts', system: factsPrompt, data: draftInput, schema: factDraftSchema,
          model, timeoutMs: 60_000, maxOutputTokens: 4000,
        }));
      const draft = factDraftSchema.parse(draftResult.data);
      const ids = new Set(read.map(s => s.id));
      for (const quote of draft.evidence_quotes) {
        if (!ids.has(quote.source_id) || !read.find(s => s.id === quote.source_id)!.evidence.includes(quote.quote)) {
          throw Error('EVIDENCE_QUOTE_NOT_VERBATIM');
        }
      }
      for (const claim of draft.claims) {
        if (!ids.has(claim.evidence_ref) || claim.supporting_source_ids.some(id => !ids.has(id) ||
          !draft.evidence_quotes.some(q => q.source_id === id))) throw Error('CLAIM_EVIDENCE_NOT_READ');
        if (claim.must_keep && ['world', 'business'].includes(story.category) && new Set(claim.supporting_source_ids
          .map(id => read.find(s => s.id === id)!.independence_group)).size < 2) throw Error('INSUFFICIENT_INDEPENDENT_EVIDENCE');
      }
      bundles.push(factSchema.parse({ story_id: 'story-' + hash(story.event_key).slice(0, 20), event_key: story.event_key,
        primary_category: story.category, content_kind: story.content_kind, published_at: read[0].published_at,
        event_date: draft.event_date, sources: read.map(s => ({ source_id: s.id, url: s.canonical_url,
          publisher: s.source_name, published_at: s.published_at, retrieved_at: s.read_at, read_at: s.read_at,
          rights_reviewed: true, independence_group: s.independence_group,
          evidence: draft.evidence_quotes.filter(q => q.source_id === s.id).map(q => q.quote).join('\n') })),
        claims: draft.claims, uncertainties: draft.uncertainties, sensitivity: draft.sensitivity,
        ...(story.content_kind==='update'&&story.update_reason?{update_reason:story.update_reason}:{}),is_demo: false }));
    }
    return { facts: bundles, failures };
  });
}
