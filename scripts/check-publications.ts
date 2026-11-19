import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {publicationCatalog,packetCanRelease} from '../lib/publications/catalog';
import {hash} from '../lib/pipeline/state.mjs';
for(const p of publicationCatalog.packets){
 const {fingerprint,...body}=p;if(hash(body)!==fingerprint)throw Error('PACKET_INTEGRITY_FAILED');
 if(new Set(p.editions.map(i=>i.edition)).size!==3||p.editions.some(i=>!i.reviewCopy||i.isDemo||i.publishedAt!==null||i.issueDate!==p.issueDate||i.revision!==p.revision||i.articles.length!==4))throw Error('INVALID_REVIEW_EDITION');
 for(const [path,sha]of Object.entries(p.files)){
  if(!path.startsWith(`/preview-issues/${p.issueDate}/r${p.revision}/`)||path.includes('..'))throw Error('INVALID_BUNDLE_PATH');
  if(createHash('sha256').update(await readFile(resolve('public','.'+path))).digest('hex')!==sha)throw Error('FILE_HASH_MISMATCH');
 }
}
for(const r of publicationCatalog.releases){
 const p=publicationCatalog.packets.find(p=>p.id===r.packetId);
 if(!p||!packetCanRelease(p)||r.fingerprint!==p.fingerprint)throw Error('UNREVIEWED_RELEASE');
 if(r.editions.some(i=>i.isDemo||i.reviewCopy||i.publishedAt!==r.releasedAt||i.issueDate!==p.issueDate||i.revision!==p.revision||hash(i.articles)!==hash(p.editions.find(e=>e.edition===i.edition)?.articles)))throw Error('RELEASE_CHANGED_REVIEWED_CONTENT');
 for(const [path,sha]of Object.entries(r.files))if(createHash('sha256').update(await readFile(resolve('public','.'+path))).digest('hex')!==sha)throw Error('RELEASE_FILE_CHANGED');
}
console.log(`Verified ${publicationCatalog.packets.length} immutable review packets and ${publicationCatalog.releases.length} releases.`);
