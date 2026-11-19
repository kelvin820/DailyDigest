import {readFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assetRecordSchema,type AssetRecord} from './prepare';
const rendition=z.object({path:z.string().regex(/^assets\/[a-f0-9]{64}-(?:web\.webp|print\.jpg)$/),width:z.number().int().positive(),height:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
const proof=z.object({assetId:z.string().regex(/^[a-f0-9]{64}$/),web:rendition,print:rendition}).passthrough();
export async function approvedBundledPhoto(source:string,expected:AssetRecord,destination:string){
 let names:string[];try{names=await readdir(resolve(source,'assets'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 for(const name of names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n))){
  const raw=JSON.parse(await readFile(resolve(source,'assets',name),'utf8')),p=proof.parse(raw);
  if(raw.originalUrl!==expected.originalUrl||raw.sourcePage!==expected.sourcePage)continue;
  const metadata=assetRecordSchema.parse(Object.fromEntries(Object.entries(raw).filter(([k])=>['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl','rightsConfirmed','photographedAt','generation'].includes(k))));
  if(metadata.kind==='generated_illustration'||metadata.credit!==expected.credit)throw Error('APPROVED_PHOTO_RIGHTS_CHANGED');
  await mkdir(resolve(destination,'assets'),{recursive:true});
  for(const r of [p.web,p.print]){const bytes=await readFile(resolve(source,r.path));if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error('APPROVED_PHOTO_HASH_MISMATCH');await copyFile(resolve(source,r.path),resolve(destination,r.path));}
  await copyFile(resolve(source,'assets',name),resolve(destination,'assets',name));
  return {assetId:p.assetId,alt:metadata.alt,caption:metadata.caption,kind:metadata.kind,credit:metadata.credit,licenseUrl:metadata.licenseUrl,sourcePage:metadata.sourcePage,rendition:{webPath:p.web.path,printPath:p.print.path,width:p.web.width,height:p.web.height},focalPoint:{x:50,y:50}};
 }
 throw Error('APPROVED_PHOTO_NOT_FOUND');
}
