import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {serviceDatabase} from './web-store';
import type {WebJob} from './web-types';

export async function verifyWebPdfs(job:WebJob){
 if(job.pdfs.length!==6||new Set(job.pdfs.map(f=>f.edition+':'+f.mode)).size!==6)throw Error('PDF_CHECKS_FAILED');
 const db=serviceDatabase();
 await Promise.all(job.pdfs.map(async file=>{
  if(file.path!==`web-editorial/${job.id}/${file.edition}-${file.mode}.pdf`)throw Error('PDF_CHECKS_FAILED');
  const {data,error}=await db.storage.from('issue-files').download(file.path);if(error||!data)throw Error('PDF_CHECKS_FAILED');
  const bytes=Buffer.from(await data.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256||(await PDFDocument.load(bytes)).getPageCount()!==file.pages)throw Error('PDF_CHECKS_FAILED');
 }));
}
