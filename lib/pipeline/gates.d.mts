import type { z } from 'zod';
import type { EditionView } from '../schemas/edition';
import type { factSchema, reviewSchema } from '../schemas/editorial';
type Review = z.infer<typeof reviewSchema> & { storyId: string; edition: string };
type PdfProof = { edition: string; mode: string; pages: number; noOverflow: boolean;
  textVerified: boolean; fontsEmbedded: boolean; revision: number; issueDate: string;
  templateVersion: string; contentHash: string; qualityValidated?:boolean };
export function publishGate(input: { editions: EditionView[]; facts: z.infer<typeof factSchema>[];
  reviews: Review[]; files: PdfProof[]; live?: boolean; verifiedImageAssetIds?: string[] }): {
  pass: boolean; mode: 'live' | 'demo'; needs_human: boolean; errors: string[];
};
