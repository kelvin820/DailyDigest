import { z } from 'zod';
import { v1Rules } from '../../config/edition-settings.mjs';
import { stats } from '../content/metrics';
import { containsTerm } from '../content/core.mjs';
import { httpsUrl } from './urls';
import {validAssetPath} from '../media/paths.mjs';

export const vocabularySchema = z.object({ term: z.string().trim().min(1),
  definitionEn: z.string().trim().min(1), meaningZhHant: z.string().trim().min(1) }).strict();
export const articleSchema = z.object({
  storyId: z.string().min(1), order: z.number().int().min(1).max(8),
  category: z.enum(['world', 'business', 'technology', 'culture', 'nature', 'science']),
  contentKind: z.enum(['news', 'update', 'knowledge']), headline: z.string().min(1).max(130),
  bodyParagraphs: z.array(z.string().min(1)).min(1).max(2), wordCount: z.number().int(),
  vocabulary: z.array(vocabularySchema).length(2), image: z.object({
    assetId: z.string().min(1), alt: z.string().min(1), caption: z.string(),
    kind: z.enum(['event_photo', 'file_photo', 'illustration', 'generated_illustration', 'icon']),
    credit: z.string().min(1), licenseUrl: httpsUrl.optional(), sourcePage: httpsUrl.optional(),
    rendition:z.object({webPath:z.string().refine(validAssetPath),printPath:z.string().refine(validAssetPath),
      width:z.number().int().positive().max(1200),height:z.number().int().positive().max(1200)}).strict().optional(),
    focalPoint:z.object({x:z.number().min(0).max(100),y:z.number().min(0).max(100)}).strict().optional(),
  }).strict(),
  sources: z.array(z.object({ publisher: z.string().min(1), url: httpsUrl, publishedAt: z.iso.datetime() }).strict()).min(1),
  eventDate: z.iso.date().nullable(), correctionNote: z.string().optional(),
  updateNote: z.string().min(1).max(300).optional(),
}).strict();
export const editionSchema = z.object({
  schemaVersion: z.literal('1.0'), issueDate: z.iso.date(), revision: z.number().int().positive(),
  edition: z.enum(['elementary', 'junior', 'senior']), targetCefr: z.enum(['A1', 'A2', 'B1', 'B2']),
  templateVersion: z.string().min(1), publishedAt: z.iso.datetime().nullable(), isDemo: z.boolean(),
  webUrl: httpsUrl.optional(),
  readingRules:z.object({min:z.number().int().positive(),max:z.number().int().positive(),
    avg:z.number().positive(),maxSentence:z.number().int().positive()}).strict().optional(),
  articles: z.array(articleSchema).length(8),
}).strict().superRefine((payload, ctx) => {
  const rules = payload.readingRules || v1Rules[payload.edition];
  if (new Set(payload.articles.map(a => a.storyId)).size !== 8) ctx.addIssue({ code: 'custom', message: 'Eight distinct stories required' });
  payload.articles.forEach((a, i) => {
    const body = a.bodyParagraphs.join(' '), s = stats(body);
    if (a.order !== i + 1 || s.count !== a.wordCount || s.count < rules.min || s.count > rules.max ||
      s.average > rules.avg || s.max > rules.maxSentence) ctx.addIssue({ code: 'custom', path: ['articles', i],
      message: 'Order or word/sentence limits failed: ' + JSON.stringify(s) });
    if (new Set(a.vocabulary.map(v => v.term.toLowerCase())).size !== 2) ctx.addIssue({
      code: 'custom', path: ['articles', i, 'vocabulary'], message: 'Two distinct vocabulary terms required' });
    for (const v of a.vocabulary) if (!containsTerm(body, v.term)) ctx.addIssue({ code: 'custom',
      path: ['articles', i, 'vocabulary'], message: 'Term absent from body: ' + v.term });
  });
});
export type ArticleView = z.infer<typeof articleSchema>;
export type EditionView = z.infer<typeof editionSchema>;
