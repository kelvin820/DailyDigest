import {readFile,writeFile,mkdir,copyFile,rename,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {editionSchema} from '../lib/schemas/edition';
import {factSchema,reviewSchema} from '../lib/schemas/editorial';
import {assetRecordSchema} from '../lib/media/prepare';
import {catalogSchema,packetSchema} from '../lib/publications/catalog';
import {hash} from '../lib/pipeline/state.mjs';

const directory=resolve(process.argv[2]||'output/generated-edition');
const read=async(name:string)=>JSON.parse(await readFile(resolve(directory,name),'utf8'));
const report=await read('report.json'),context=await read('context.json');
if(report.status!=='review_ready'||!report.pdfVerified||report.databaseWritten||report.published||context.packetId!==report.packetId)throw Error('PACKET_NOT_READY');
const issues=z.array(editionSchema).length(3).parse(await read('editions.json'));
const id=report.packetId as string;if(!/^\d{4}-\d{2}-\d{2}-r[1-9]\d*$/.test(id))throw Error('INVALID_PACKET_ID');
if(new Set(issues.map(i=>i.edition)).size!==3||issues.some(i=>i.isDemo||!i.reviewCopy||i.publishedAt!==null||i.articles.length!==4||i.issueDate!==report.issueDate||i.revision!==report.revision))throw Error('EDITION_MISMATCH');
const facts=z.array(factSchema).length(4).parse(await read('facts.json'));
const reviews=z.array(reviewSchema.extend({storyId:z.string(),edition:z.enum(['elementary','junior','senior'])})).length(12).parse(await read('reviews.json'));
const verified=await read('verified-files.json');
const base=`/preview-issues/${report.issueDate}/r${report.revision}/`;
const destination=resolve('output/import-staging',id);await mkdir(resolve(destination,'assets'),{recursive:true});
const files:Record<string,string>={},pdfPaths:Record<string,string>={},imageManifests:Record<string,unknown>[]=[];
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function copy(name:string){const bytes=await readFile(resolve(directory,name));await copyFile(resolve(directory,name),resolve(destination,name));files[base+name]=sha(bytes);}
const seen=new Set<string>();
for(const issue of issues){
 for(const mode of ['color','ink']){
  const proof=verified.find((f:{edition:string;mode:string})=>f.edition===issue.edition&&f.mode===mode);
  if(!proof||proof.pages!==2||!proof.noOverflow||!proof.textVerified||!proof.fontsEmbedded||proof.contentHash!==hash(issue))throw Error('STALE_PDF');
  const name=`DD_${issue.issueDate}_${issue.edition}_r${issue.revision}_${mode}.pdf`;await copy(name);pdfPaths[issue.edition+':'+mode]=base+name;
 }
 for(const a of issue.articles)if(a.image.rendition){
  if(!seen.has(a.image.assetId)){
   const manifest=await read('assets/'+a.image.assetId+'.json');assetRecordSchema.parse(Object.fromEntries(Object.entries(manifest).filter(([k])=>['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl','rightsConfirmed','photographedAt','generation'].includes(k))));
   for(const key of ['web','print']){const entry=manifest[key];if(!/^assets\/[a-f0-9]{64}-(web\.webp|print\.jpg)$/.test(entry.path)||sha(await readFile(resolve(directory,entry.path)))!==entry.sha256)throw Error('ASSET_HASH_MISMATCH');await copy(entry.path);}
   imageManifests.push(manifest);seen.add(a.image.assetId);
  }
  a.image.rendition.webPath=base+a.image.rendition.webPath;
  a.image.rendition.printPath=base+a.image.rendition.printPath;
 }
}
const body={id,issueDate:report.issueDate,revision:report.revision,generatedAt:report.generatedAt,editions:issues,facts,reviews,files,imageManifests,pdfPaths,
 production:{model:report.model,totalModelCalls:report.totalModelCalls,totalTokens:report.totalTokens,costStatus:report.costStatus,imageAttempts:report.imageAttempts,editorCorrections:report.editorCorrectionsApplied||0,sourceSnapshots:report.sourceSnapshotsUsed||0,sourceRun:process.env.SOURCE_RUN_ID?Number(process.env.SOURCE_RUN_ID):null}};
const packet=packetSchema.parse({...body,fingerprint:hash(body)});
const catalog=catalogSchema.parse(JSON.parse(await readFile('content/publications/catalog.json','utf8')));
const old=catalog.packets.find(p=>p.id===id);
if(old&&old.fingerprint!==packet.fingerprint)throw Error('IMMUTABLE_PACKET_CHANGED');
if(!old){await mkdir(resolve('public','.'+base),{recursive:true});await cp(destination,resolve('public','.'+base),{recursive:true});catalog.packets.push(packet);}
await writeFile('content/publications/catalog.json.tmp',JSON.stringify(catalog,null,2)+'\n');await rename('content/publications/catalog.json.tmp','content/publications/catalog.json');
console.log(JSON.stringify({id,fingerprint:packet.fingerprint,reviewPage:'/review/'+id,status:'review',published:false,databaseWritten:false}));
