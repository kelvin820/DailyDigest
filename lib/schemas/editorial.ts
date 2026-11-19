import { z } from 'zod';
import { vocabularySchema } from './edition';
import { httpsUrl } from './urls';
export const claimSchema = z.object({ claim_id: z.string().min(1), text: z.string().min(1),
  supporting_source_ids: z.array(z.string().min(1)).min(1), evidence_ref: z.string().min(1),
  status: z.enum(['reported_plan', 'reported', 'completed', 'uncertain']), must_keep: z.boolean() }).strict();
export const factSchema = z.object({
  story_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), event_key: z.string().min(1),
  primary_category: z.enum(['world', 'business', 'technology', 'culture', 'nature', 'science']),
  content_kind: z.enum(['news', 'update', 'knowledge']), published_at: z.iso.datetime(), published_at_precision:z.enum(['date','datetime','month']).optional(), event_date: z.iso.date().nullable(),
  sources: z.array(z.object({ source_id: z.string().min(1), url: httpsUrl, publisher: z.string().min(1),
    published_at: z.iso.datetime(), published_at_precision:z.enum(['date','datetime','month']).optional(), retrieved_at: z.iso.datetime(), read_at: z.iso.datetime(),
    rights_reviewed: z.literal(true), independence_group: z.string().min(1), evidence: z.string().min(30) }).strict()).min(1),
  claims: z.array(claimSchema).min(1), uncertainties: z.array(z.string()),
  update_reason: z.string().min(1).max(300).optional(),
  sensitivity: z.enum(['low', 'high']), is_demo: z.boolean(),
}).strict().superRefine((f, c) => {
  const ids = new Set(f.sources.map(s => s.source_id));
  if (ids.size !== f.sources.length) c.addIssue({ code: 'custom', message: 'Duplicate source ids' });
  for (const claim of f.claims) if (claim.supporting_source_ids.some(id => !ids.has(id))) c.addIssue({ code: 'custom', message: 'Claim references unread source' });
  if (!f.claims.some(claim => claim.must_keep)) c.addIssue({ code: 'custom', message: 'An event core must be marked must_keep' });
  if (new Set(f.claims.map(claim => claim.claim_id)).size !== f.claims.length) c.addIssue({ code: 'custom', message: 'Duplicate claim ids' });
});
export const writerSchema = z.object({ headline: z.string().min(1).max(130),
  body_paragraphs: z.array(z.string().min(1)).min(1).max(2), vocabulary: z.array(vocabularySchema).length(2),
  used_claim_ids: z.array(z.string()), omitted_optional_claim_ids: z.array(z.string()),
  editorial_flags: z.array(z.string()) }).strict();
export const writerResponseSchema = z.union([writerSchema, z.object({ failure: z.object({
  code: z.enum(['insufficient_evidence', 'cannot_meet_level']), reason: z.string().min(1),
}).strict() }).strict()]);
export const reviewSchema = z.object({
  factual_status: z.enum(['pass', 'needs_revision', 'insufficient_evidence']),
  level_fit: z.enum(['suitable', 'too_hard', 'too_simple', 'uncertain']),
  suitability: z.enum(['pass', 'needs_human_review']), issues: z.array(z.object({
    severity: z.enum(['critical', 'major', 'minor']), span: z.string(), reason: z.string(),
    claim_ids: z.array(z.string()), suggested_action: z.string() }).strict()),
  publish_recommendation: z.enum(['pass', 'revise', 'human_review']),
}).strict();
