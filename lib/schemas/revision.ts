import { z } from 'zod';
import { editionKeys } from '../../config/editions';
import { editionSchema, vocabularySchema, type EditionView } from './edition';
import { stats } from '../content/metrics';

export const revisionInput = z.object({
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  edition: z.enum(editionKeys),
  storyId: z.string().min(1).max(100),
  headline: z.string().trim().min(1).max(130),
  bodyParagraphs: z.array(z.string().trim().min(1).max(2000)).min(1).max(2),
  vocabulary: z.array(vocabularySchema).length(2),
  correctionNote: z.string().trim().min(1).max(500),
}).strict();

export function revisedPayload(source: EditionView, input: z.infer<typeof revisionInput>) {
  if (source.edition !== input.edition || !source.articles.some(a => a.storyId === input.storyId)) {
    throw Error('STORY_NOT_FOUND');
  }
  return editionSchema.parse({ ...source, articles: source.articles.map(a => a.storyId === input.storyId ? {
    ...a, headline: input.headline, bodyParagraphs: input.bodyParagraphs,
    vocabulary: input.vocabulary, correctionNote: input.correctionNote,
    wordCount: stats(input.bodyParagraphs.join(' ')).count,
  } : a) });
}
