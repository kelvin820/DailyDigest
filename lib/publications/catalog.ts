import catalog from '../../content/publications/catalog.json';
import {z} from 'zod';
import {editionSchema,type EditionView} from '../schemas/edition';
import {factSchema,reviewSchema} from '../schemas/editorial';
import type {Edition} from '../../config/editions';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const packetSchema=z.object({id:z.string().regex(/^\d{4}-\d{2}-\d{2}-r[1-9]\d*$/),
 issueDate:z.iso.date(),revision:z.number().int().positive(),fingerprint:digest,generatedAt:z.iso.datetime(),
 editions:z.array(editionSchema).length(3),facts:z.array(factSchema).length(4),
 reviews:z.array(reviewSchema.extend({storyId:z.string(),edition:z.enum(['elementary','junior','senior'])})).length(12),
 files:z.record(z.string(),digest),imageManifests:z.array(z.record(z.string(),z.unknown())),
 production:z.object({model:z.string(),totalModelCalls:z.number(),totalTokens:z.number(),costStatus:z.string(),imageAttempts:z.number(),sourceRun:z.number().nullable(),editorCorrections:z.number().optional(),sourceSnapshots:z.number().optional()}),
 pdfPaths:z.record(z.string(),z.string()),
});
export const releaseSchema=z.object({packetId:z.string(),fingerprint:digest,releasedAt:z.iso.datetime(),
 approvedBy:z.string().min(1),approvalMethod:z.enum(['github_manual','developer_test_release']),humanReviewCompleted:z.boolean(),
 editions:z.array(editionSchema).length(3),pdfPaths:z.record(z.string(),z.string()),files:z.record(z.string(),digest)});
export const catalogSchema=z.object({version:z.literal(1),packets:z.array(packetSchema),releases:z.array(releaseSchema)});
export type Packet=z.infer<typeof packetSchema>;
export type Catalog=z.infer<typeof catalogSchema>;
export const publicationCatalog:Catalog=catalogSchema.parse(catalog);

export function packetById(id:string,data=publicationCatalog){return data.packets.find(p=>p.id===id);}
export function reviewPackets(data=publicationCatalog){return [...data.packets].sort((a,b)=>b.issueDate.localeCompare(a.issueDate)||b.revision-a.revision);}
export function publishedIssues(data=publicationCatalog){
 const latest=new Map<string,typeof data.releases[number]>();
 for(const r of [...data.releases].sort((a,b)=>b.editions[0].revision-a.editions[0].revision))if(!latest.has(r.editions[0].issueDate))latest.set(r.editions[0].issueDate,r);
 return [...latest.values()].sort((a,b)=>b.editions[0].issueDate.localeCompare(a.editions[0].issueDate));
}
export function publishedIssue(edition:Edition,date?:string,data=publicationCatalog):EditionView|null{
 const release=publishedIssues(data).find(r=>!date||r.editions[0].issueDate===date);
 return release?.editions.find(i=>i.edition===edition)||null;
}
export function publishedPdf(date:string,edition:Edition,mode:string,data=publicationCatalog){
 return publishedIssues(data).find(r=>r.editions[0].issueDate===date)?.pdfPaths[edition+':'+mode]||null;
}
export function packetCanRelease(packet:Packet){return packet.reviews.length===12&&new Set(packet.reviews.map(r=>r.storyId+':'+r.edition)).size===12&&packet.reviews.every(r=>r.factual_status==='pass'&&r.level_fit==='suitable'&&r.suitability==='pass'&&r.publish_recommendation==='pass'&&!r.issues.some(i=>i.severity!=='minor'));}
