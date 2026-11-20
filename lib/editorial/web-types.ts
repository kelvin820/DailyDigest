import {z} from 'zod';
import {factSchema} from '../schemas/editorial';
import type {EditionView,ArticleView} from '../schemas/edition';
import type {Packet} from '../publications/catalog';
import type {BenchmarkDraft} from './benchmarks';
import {regenerationRequestSchema} from './requests';
import type {NewsCandidate} from './news-config';

export const webGenerationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('generate'),issueDate:z.iso.date(),sourceIds:z.array(z.string().min(1).max(100)).length(4).refine(v=>new Set(v).size===4),direction:z.string().trim().max(1200).default('')}).strict(),
 z.object({kind:z.literal('news'),issueDate:z.iso.date(),roundId:z.uuid(),sourceIds:z.array(z.string().min(1).max(100)).length(4).refine(v=>new Set(v).size===4),direction:z.string().trim().max(1200).default(''),imageGeneration:z.boolean().default(true),autoSelect:z.boolean().default(false),campaignId:z.uuid().optional()}).strict(),
 z.object({kind:z.literal('regenerate'),request:regenerationRequestSchema}).strict(),
]);
export type WebGenerationInput=z.infer<typeof webGenerationSchema>;
export type WebFact=z.infer<typeof factSchema>;
export type Checkpoint={status:'success';inputHash:string;output:unknown;outputHash:string};
export type WebPdf={path:string;sha256:string;pages:number;edition:string;mode:'color'|'ink'};
export type WebJob={version:number;id:string;createdAt:string;updatedAt:string;issueDate:string;revision:number;
 status:'pending'|'running'|'needs_review'|'needs_attention';kind:'generate'|'regenerate';
 input:WebGenerationInput;facts:WebFact[];model:string;reviewerModel:string;promptHash:string;imageSnapshots:Record<string,ArticleView['image']>;
 context?:ReturnType<typeof import('./regeneration').resolveRegeneration>;
 checkpoints:Record<string,Checkpoint>;activeStep:string|null;lease:{owner:string;expiresAt:number}|null;
 editions:EditionView[];drafts:BenchmarkDraft[];reviews:Packet['reviews'];pdfs:WebPdf[];
 error:string|null;events:{at:string;message:string}[];usage:{calls:number;inputTokens:number;outputTokens:number};
 intakeCandidates?:NewsCandidate[];execution?:'workflow';workflowRunId?:string;
 imageStates?:Record<string,'running'|'done'|'failed'>;rejectedNewsIds?:string[];
 campaignId?:string;
};
export type WebRelease={version:number;jobId:string;fingerprint:string;issueDate:string;createdAt:string;releasedAt:string;approvalMethod:'web_manual'|'scheduled_auto';editions:EditionView[];pdfs:WebPdf[]};
