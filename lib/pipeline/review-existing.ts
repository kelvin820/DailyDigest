import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { editionSchema } from '../schemas/edition';
import { factSchema, reviewSchema } from '../schemas/editorial';
import { cachedStep } from './state.mjs';
import { stats } from '../content/metrics';
import type { TextModelProvider } from '../providers/text';
import type { Store } from './editorial';

// Human edits are reviewed as supplied; restarting never overwrites them with a fresh writer call.
export async function reviewExisting(payloads: unknown[], facts: z.infer<typeof factSchema>[],
  provider: TextModelProvider, store: Store, model: string) {
  const editions = payloads.map(p => editionSchema.parse(p));
  const prompt = await readFile('prompts/reviewer.v1.txt', 'utf8');
  const reviews = [];
  for (const issue of editions) {
    for (const article of issue.articles) {
      const fact = facts.find(f => f.story_id === article.storyId);
      if (!fact || fact.is_demo || article.category !== fact.primary_category) throw Error('REVISION_FACT_MISMATCH');
      const data = { fact, article, target: issue.targetCefr, statistics: stats(article.bodyParagraphs.join(' ')) };
      const result = await cachedStep(store, `${article.storyId}:${issue.edition}:review:manual`,
        { ...data, model, promptVersion: 'reviewer.v1', prompt, provider: provider.cacheIdentity }, () => provider.generateStructured({
          task: 'review', system: prompt, data, model, schema: reviewSchema, timeoutMs: 60_000, maxOutputTokens: 2200,
        }));
      reviews.push({ ...reviewSchema.parse(result.data), storyId: article.storyId, edition: issue.edition });
    }
  }
  return { editions, reviews };
}
