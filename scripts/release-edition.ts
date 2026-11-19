import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {catalogSchema,packetCanRelease} from '../lib/publications/catalog';
import {renderIssues} from './render';
import {publishGate} from '../lib/pipeline/gates.mjs';
import {assetRecordSchema} from '../lib/media/prepare';
import {hash} from '../lib/pipeline/state.mjs';

const id=process.env.PACKET_ID,expected=process.env.EXPECTED_FINGERPRINT,actor=process.env.RELEASE_ACTOR;
const method=process.env.RELEASE_METHOD;
if(!id||!actor||!expected||!['github_manual','developer_test_release'].includes(method||''))throw Error('EXPLICIT_RELEASE_REQUIRED');
if(method==='github_manual'&&(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.CONFIRM_REVIEW!=='true'||actor!==process.env.GITHUB_ACTOR))throw Error('OWNER_REVIEW_REQUIRED');
const catalog=catalogSchema.parse(JSON.parse(await readFile('content/publications/catalog.json','utf8')));
const packet=catalog.packets.find(p=>p.id===id);
if(!packet||packet.fingerprint!==expected)throw Error('STALE_REVIEW');
const {fingerprint,...body}=packet;if(hash(body)!==fingerprint)throw Error('PACKET_INTEGRITY_FAILED');
if(!packetCanRelease(packet))throw Error('MODEL_REVIEW_REQUIRES_CORRECTION');
const existing=catalog.releases.find(r=>r.packetId===id);
if(existing){console.log('Already released; nothing changed.');process.exit(0);}
if(catalog.releases.some(r=>r.editions[0].issueDate===packet.issueDate&&r.editions[0].revision>=packet.revision))throw Error('OLDER_REVISION');
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
for(const [path,digest]of Object.entries(packet.files)){
 if(!path.startsWith(`/preview-issues/${packet.issueDate}/r${packet.revision}/`)||path.includes('..'))throw Error('INVALID_BUNDLE_PATH');
 if(sha(await readFile(resolve('public','.'+path)))!==digest)throw Error('BUNDLE_HASH_MISMATCH');
}
for(const m of packet.imageManifests)assetRecordSchema.parse(Object.fromEntries(Object.entries(m).filter(([k])=>['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl','rightsConfirmed','photographedAt','generation'].includes(k))));
const releasedAt=new Date().toISOString();
const editions=packet.editions.map(i=>({...structuredClone(i),reviewCopy:false,publishedAt:releasedAt}));
const directory=resolve('output/release',id);await mkdir(directory,{recursive:true});
for(const issue of editions)for(const a of issue.articles)if(a.image.rendition)for(const p of [a.image.rendition.webPath,a.image.rendition.printPath]){
 const target=resolve(directory,'.'+p);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(resolve('public','.'+p),target);
}
const files=await renderIssues(editions,directory);
const gate=publishGate({editions,facts:packet.facts,reviews:packet.reviews,files,live:true,verifiedImageAssetIds:packet.imageManifests.map(m=>String(m.assetId))});
if(!gate.pass||gate.needs_human)throw Error('PUBLISH_GATE:'+gate.errors.join('|'));
const pdfPaths:Record<string,string>={},digests:Record<string,string>={};
const base=`/preview-issues/${packet.issueDate}/r${packet.revision}/published/`;
await mkdir(resolve('public','.'+base),{recursive:true});
for(const file of files){const name=`DD_${packet.issueDate}_${file.edition}_r${packet.revision}_${file.mode}.pdf`;const path=base+name;const bytes=await readFile(file.path);await copyFile(file.path,resolve('public','.'+path));pdfPaths[file.edition+':'+file.mode]=path;digests[path]=sha(bytes);}
catalog.releases.push({packetId:id,fingerprint,releasedAt,approvedBy:actor,approvalMethod:method as 'github_manual'|'developer_test_release',humanReviewCompleted:method==='github_manual',editions,pdfPaths,files:digests});
await writeFile('content/publications/catalog.json.tmp',JSON.stringify(catalog,null,2)+'\n');await rename('content/publications/catalog.json.tmp','content/publications/catalog.json');
await writeFile(resolve(directory,'publication-proof.json'),JSON.stringify({packetId:id,fingerprint,actor,method,gate,pdfVerified:true,databaseWritten:false,publicationBackend:'git-versioned-catalog',releasedAt},null,2));
console.log(JSON.stringify({status:'release_prepared',packetId:id,backend:'git-versioned-catalog',databaseWritten:false,deployRequired:true}));
