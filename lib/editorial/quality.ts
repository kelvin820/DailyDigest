import {z} from 'zod';
import {reviewSchema} from '../schemas/editorial';
export const readershipSchema=z.object({
 interest:z.number().int().min(1).max(5),
 information:z.number().int().min(1).max(5),
 readability:z.number().int().min(1).max(5),
 reason:z.string().min(1).max(1200),
 suggestion:z.string().max(1200),
}).strict();
export const editorialReviewSchema=reviewSchema.extend({readership:readershipSchema});
export const editorialReviewPrompt=`Also return readership: {interest, information, readability, reason, suggestion}.
Rate each dimension from 1 (weak) to 5 (strong), relative to the supplied reading age/CEFR target.
Interest: concrete curiosity, an engaging real detail, and relevance to a child; do not reward sensationalism.
Information: useful source-supported facts and a clear takeaway, rather than filler or repeated sentences.
Readability: clear structure, explanations and manageable background assumptions for this audience.
Give specific brief reasons and an actionable rewrite suggestion in Traditional Chinese (Taiwan).
These are editorial opinions, not objective scores or permission to invent facts. Do not lower factual standards for fun.`;
