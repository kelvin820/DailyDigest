import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';

export async function withPdfProfile<T>(run:(path:string)=>Promise<T>){
 const root=resolve(tmpdir()),profile=await mkdtemp(join(root,'dayday-pdf-'));
 try{return await run(profile);}finally{
  if(dirname(resolve(profile))!==root||!basename(profile).startsWith('dayday-pdf-'))throw Error('PDF_PROFILE_PATH');
  await rm(profile,{recursive:true,force:true,maxRetries:2});
 }
}
