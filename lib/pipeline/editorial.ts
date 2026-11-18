import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { editions, editionKeys } from '../../config/editions';
import { articleSchema, editionSchema, type ArticleView } from '../schemas/edition';
import { factSchema, writerResponseSchema, reviewSchema } from '../schemas/editorial';
import type { TextModelProvider } from '../providers/text';
import { stats } from '../content/metrics';
import { containsTerm } from '../content/core.mjs';
import { cachedStep } from './state.mjs';

export type Store = { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> };
export async function produceEditions({ facts, issueDate, revision, provider, store, writerModel, reviewerModel }: {
  facts: z.infer<typeof factSchema>[]; issueDate: string; revision: number; provider: TextModelProvider;
  store: Store; writerModel: string; reviewerModel: string;
}) {
  if (facts.length !== 8 || new Set(facts.map(f => f.story_id)).size !== 8) throw Error('EIGHT_EVENTS_REQUIRED');
  facts.forEach(f => factSchema.parse(f));
  const writer = await readFile('prompts/writer.v1.txt', 'utf8');
  const reviewPrompt = await readFile('prompts/reviewer.v1.txt', 'utf8');
  const payloads = [], reviews = [];
  for (const edition of editionKeys) {
    const c = editions[edition], articles: ArticleView[] = [];
    for (const [index, fact] of facts.entries()) {
      let feedback: unknown = null, accepted = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        const system = writer.replaceAll('{{edition}}', edition).replaceAll('{{target_cefr}}', c.cefr)
          .replaceAll('{{english_variant}}', 'American English').replaceAll('{{min_words}}', String(c.min))
          .replaceAll('{{max_words}}', String(c.max)).replaceAll('{{avg_sentence_max}}', String(c.avg))
          .replaceAll('{{sentence_max}}', String(c.sentenceMax));
        const input = { fact, feedback, system, model: writerModel, promptVersion: 'writer.v1', edition, attempt, provider: provider.cacheIdentity };
        const result = await cachedStep(store, `${fact.story_id}:${edition}:write:${attempt}`, input,
          () => provider.generateStructured({ task: attempt ? 'revise' : 'write', system, data: { fact, feedback },
            schema: writerResponseSchema, model: writerModel, timeoutMs: 60_000, maxOutputTokens: 1800 }));
        const data = writerResponseSchema.parse(result.data);
        if ('failure' in data) throw Error('WRITER_' + data.failure.code.toUpperCase());
        const ids = new Set(fact.claims.map(claim => claim.claim_id));
        if (data.used_claim_ids.some(id => !ids.has(id)) || data.omitted_optional_claim_ids.some(id => !ids.has(id))) {
          throw Error('CLAIM_ALLOWLIST_FAILED');
        }
        const body = data.body_paragraphs.join(' '), s = stats(body);
        const mustKeep = fact.claims.every(claim => !claim.must_keep || data.used_claim_ids.includes(claim.claim_id));
        const lengthPass = s.count >= c.min && s.count <= c.max && s.average <= c.avg && s.max <= c.sentenceMax;
        const vocabPass = new Set(data.vocabulary.map(v => v.term.toLowerCase())).size === 2 &&
          data.vocabulary.every(v => containsTerm(body, v.term));
        if (!mustKeep || !lengthPass || !vocabPass) {
          feedback = { previous_article:data,statistics: s, wordLimits: c, mustKeep, vocabPass,
            instruction: 'Revise the complete article; do not truncate sentences.' };
          continue;
        }
        const article = articleSchema.parse({ storyId: fact.story_id, order: index + 1,
          category: fact.primary_category, contentKind: fact.content_kind, headline: data.headline,
          bodyParagraphs: data.body_paragraphs, wordCount: s.count, vocabulary: data.vocabulary,
          image: { assetId: fact.primary_category, alt: fact.primary_category + ' category illustration',
            caption: 'Original category illustration', kind: 'icon', credit: 'DayDay original artwork' },
          sources: fact.sources.map(source => ({ publisher: source.publisher, url: source.url, publishedAt: source.published_at })),
          eventDate: fact.event_date,...(fact.update_reason?{updateNote:fact.update_reason}:{}) });
        const reviewed = await cachedStep(store, `${fact.story_id}:${edition}:review:${attempt}`,
          { fact, article, target: c.cefr, stats: s, model: reviewerModel, promptVersion: 'reviewer.v1', prompt: reviewPrompt, provider: provider.cacheIdentity },
          () => provider.generateStructured({ task: 'review', system: reviewPrompt,
            data: { fact, article, target: c.cefr, statistics: s }, schema: reviewSchema,
            model: reviewerModel, timeoutMs: 60_000, maxOutputTokens: 2200 }));
        const review = reviewSchema.parse(reviewed.data);
        if (review.issues.some(issue => issue.claim_ids.some(id => !ids.has(id)))) throw Error('REVIEW_CLAIM_ALLOWLIST_FAILED');
        if (review.factual_status === 'pass' && review.level_fit === 'suitable' &&
          review.publish_recommendation !== 'revise' && !review.issues.some(issue => issue.severity !== 'minor')) {
          articles.push(article); reviews.push({ ...review, storyId: fact.story_id, edition }); accepted = true; break;
        }
        feedback = { previous_article:data,review, statistics: s, wordLimits: c };
      }
      if (!accepted) throw Error(`NEEDS_REVIEW:${fact.story_id}:${edition}`);
    }
    payloads.push(editionSchema.parse({ schemaVersion: '1.0', issueDate, revision, edition,
      readingRules:{min:c.min,max:c.max,avg:c.avg,maxSentence:c.sentenceMax},
      targetCefr: c.cefr, templateVersion: '1.0', publishedAt: null, isDemo: facts.some(f => f.is_demo), articles }));
  }
  return { editions: payloads, reviews };
}
