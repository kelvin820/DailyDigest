import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import serverChromium from '@sparticuz/chromium';
import {PDFDocument} from 'pdf-lib';
import {renderPrint} from '../render.mjs';
import {checkPrintLayout} from './print-checks.mjs';
import {editions,type Edition} from '../../config/editions';
import {serviceDatabase} from '../editorial/web-store';
import type {WebJob,WebPdf} from '../editorial/web-types';

export async function renderWebPdfs(job:WebJob,edition:Edition,upload?: (path:string,bytes:Buffer)=>Promise<void>,folder=''){
 let stage='ASSETS';
 try{return await render(job,edition,upload,folder,value=>{stage=value;});}catch(error){
  const message=error instanceof Error?error.message:'Unknown PDF error';
  console.error('pdf_render_failed',{jobId:job.id,edition,stage,detail:message.replace(/https?:\/\/\S+/g,'[url]').slice(0,1400)});
  if(/^PDF_[A-Z_]+$/.test(message))throw error;
  throw Error('PDF_'+stage+'_FAILED');
 }
}
async function render(job:WebJob,edition:Edition,upload:((path:string,bytes:Buffer)=>Promise<void>)|undefined,folder:string,stage:(value:string)=>void){
 if(folder&&!/^published-[a-f0-9-]{36}$/.test(folder))throw Error('INVALID_PDF_FOLDER');
 const issue=job.editions.find(i=>i.edition===edition)!;
 const css=await readFile(resolve('app/globals.css'),'utf8');
 stage('BROWSER');
 const browser=await chromium.launch(process.env.VERCEL?{args:serverChromium.args,executablePath:await serverChromium.executablePath(),headless:true}:{executablePath:process.env.DD_CHROME||undefined,headless:true});
 const results:WebPdf[]=[];
 try{
  const page=await browser.newPage();
  const origin='http://dayday-print.local';
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   const path=decodeURIComponent(url.pathname);
   if(path.includes('..')||path.includes('\\'))return route.abort();
   try{
    if(/^\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(path)){
     const file=path.endsWith('/NotoSans-Regular.ttf')||path.endsWith('/NotoSansTC.ttf')?'NotoSansTC-Print.ttf':path.split('/').at(-1)!;
     return route.fulfill({body:await readFile(resolve('public/fonts',file)),contentType:'font/ttf'});
    }
    if(/^\/preview-issues\/[a-zA-Z0-9/_.-]+\.(?:jpg|webp)$/.test(path))return route.fulfill({body:await readFile(resolve('public','.'+path)),contentType:path.endsWith('.jpg')?'image/jpeg':'image/webp'});
   }catch{/* Missing assets fail the print checks. */}
   return route.abort();
  });
  for(const mode of ['color','ink'] as const){
   stage('LAYOUT');
   const html='<!doctype html><html lang="zh-Hant"><head><base href="'+origin+'/"><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderPrint(issue,mode)+'</body></html>';
   await page.setContent(html,{waitUntil:'load'});
   await checkPrintLayout(page,editions[edition].minPrintSize,4);
   stage('OUTPUT');const bytes=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}),pages=(await PDFDocument.load(bytes)).getPageCount();
   if(pages<1||bytes.length>4_000_000)throw Error('PDF_SIZE_OR_PAGES');
   const path=`web-editorial/${job.id}/${folder?folder+'/':''}${edition}-${mode}.pdf`;
   stage('STORAGE');if(upload)await upload(path,bytes);else{
    const {error}=await serviceDatabase().storage.from('issue-files').upload(path,bytes,{contentType:'application/pdf',upsert:true});
    if(error)throw Error('PDF_STORAGE_FAILED');
   }
   results.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),pages,edition,mode});
  }
 }finally{await browser.close();}
 return results;
}
