import {z} from 'zod';
import index from '../../content/benchmarks/index.json';
import {articleSchema} from '../schemas/edition';
import {factSchema} from '../schemas/editorial';
import {editorialReviewSchema} from './quality';
import {regenerationRequestSchema} from './requests';

export const benchmarkDraftSchema=z.object({storyId:z.string(),edition:z.enum(['elementary','junior','senior']),article:articleSchema.nullable(),writerMs:z.number().nonnegative(),reviewerMs:z.number().nonnegative(),writerCalls:z.number().int().nonnegative(),reviewerCalls:z.number().int().nonnegative(),errors:z.array(z.string()),warnings:z.array(z.string()).optional(),assessment:editorialReviewSchema.nullable(),firstPass:z.boolean(),reused:z.boolean().optional()});
export const benchmarkSchema=z.object({
 id:z.string().regex(/^[a-z0-9-]{1,80}$/),issueDate:z.iso.date(),model:z.string(),status:z.enum(['complete','partial','needs_source']),
 kind:z.enum(['benchmark','regeneration']).optional(),
 lengthPolicy:z.enum(['strict','advisory']).optional(),
 request:regenerationRequestSchema.optional(),
 createdAt:z.iso.datetime().optional(),
 rounds:z.array(z.object({number:z.number().int().min(1).max(3),drafts:z.array(benchmarkDraftSchema).max(12),apiMs:z.number().nonnegative(),firstPass:z.number().int().nonnegative(),complete:z.boolean()})).max(3),
 facts:z.array(factSchema).length(4),sourceMode:z.string(),sourceLabels:z.array(z.object({storyId:z.string(),label:z.string().nullable()})),methodology:z.string(),
 totalCalls:z.number().int().nonnegative(),totalTokens:z.number().int().nonnegative(),costStatus:z.literal('cost_unknown'),estimatedUsd:z.null(),
 pdfRound:z.number().int().nullable(),pdfFiles:z.array(z.object({edition:z.enum(['elementary','junior','senior']),mode:z.enum(['color','ink']),pages:z.number().int().positive(),path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),qualityValidated:z.boolean()})),
 errorCode:z.string().nullable(),published:z.literal(false),databaseWritten:z.literal(false),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),sourceRun:z.number().int().nullable(),
});
export type Benchmark=z.infer<typeof benchmarkSchema>;
export type BenchmarkDraft=z.infer<typeof benchmarkDraftSchema>;
export const benchmarkRuns=z.object({runs:z.array(benchmarkSchema)}).parse(index).runs;
export const benchmarkById=(id:string)=>benchmarkRuns.find(r=>r.id===id);
