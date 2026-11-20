import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import serverChromium from '@sparticuz/chromium';
import {PDFDocument} from 'pdf-lib';
import {renderPrint} from '../render.mjs';
import {checkPrintLayout} from './print-checks.mjs';
import {printPdfOptions} from './options.mjs';
import {recoverClosedBrowser} from './browser-retry';
import {withPdfProfile} from './temporary-profile';
import {editions,type Edition} from '../../config/editions';
import {serviceDatabase} from '../editorial/web-store';
import type {WebJob,WebPdf} from '../editorial/web-types';

export async function renderWebPdfs(job:WebJob,edition:Edition,upload?:(path:string,bytes:Buffer)=>Promise<void>,folder='',onFile?:(file:WebPdf)=>Promise<void>){
 let stage='ASSETS',currentMode='';
 try{
  if(folder&&!/^published-[a-f0-9-]{36}$/.test(folder))throw Error('INVALID_PDF_FOLDER');
  const issue=job.editions.find(i=>i.edition===edition)!;
  const css=await readFile(resolve('app/globals.css'),'utf8'),results:WebPdf[]=[];
  const assets=new Map<string,Promise<Buffer>>();
  const file=(path:string)=>{if(!assets.has(path))assets.set(path,readFile(path));return assets.get(path)!;};
  if(process.env.VERCEL)serverChromium.setGraphicsMode=false;
  for(const mode of ['color','ink'] as const){
   currentMode=mode;
   const path=`web-editorial/${job.id}/${folder?folder+'/':''}${edition}-${mode}.pdf`;
   const existing=job.pdfs.find(p=>p.path===path);if(existing){results.push(existing);continue;}
   const bytes=await recoverClosedBrowser(async attempt=>withPdfProfile(async profile=>{
    stage='BROWSER';
    // Default contexts avoid the single-process Chromium incognito crash.
    // Each PDF gets a fresh browser rather than resetting a shared page.
    const context=await chromium.launchPersistentContext(profile,process.env.VERCEL?
     {args:serverChromium.args,executablePath:await serverChromium.executablePath(),headless:true}:
     {executablePath:process.env.DD_CHROME||undefined,headless:true});
    try{
     const page=context.pages()[0]??await context.newPage(),origin='http://dayday-print.local';
     page.on('crash',()=>console.warn('pdf_page_crashed',{jobId:job.id,edition,mode,attempt}));
     await context.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      const asset=decodeURIComponent(url.pathname);if(asset.includes('..')||asset.includes('\\'))return route.abort();
      try{
       if(/^\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(asset)){
        const name=asset.endsWith('/NotoSans-Regular.ttf')||asset.endsWith('/NotoSansTC.ttf')?'NotoSansTC-Print.ttf':asset.split('/').at(-1)!;
        return route.fulfill({body:await file(resolve('public/fonts',name)),contentType:'font/ttf'});
       }
       if(/^\/preview-issues\/[a-zA-Z0-9/_.-]+\.(?:jpg|webp)$/.test(asset))return route.fulfill({body:await file(resolve('public','.'+asset)),contentType:asset.endsWith('.jpg')?'image/jpeg':'image/webp'});
       const stored=asset.match(/^\/api\/editorial\/assets\/([a-f0-9]{64})\/(web|print)$/);
       if(stored){const path=`web-assets/${stored[1]}-${stored[2]==='web'?'web.webp':'print.jpg'}`;
        if(!assets.has(path))assets.set(path,(async()=>{const {data,error}=await serviceDatabase().storage.from('issue-files').download(path);if(error||!data)throw Error('IMAGE_STORAGE_FAILED');return Buffer.from(await data.arrayBuffer());})());
        return route.fulfill({body:await assets.get(path)!,contentType:stored[2]==='web'?'image/webp':'image/jpeg'});
       }
      }catch{/* Failed assets are rejected by print checks. */}
      return route.abort();
     });
     stage='LAYOUT';
     await page.setContent('<!doctype html><html lang="zh-Hant"><head><base href="'+origin+'/"><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderPrint(issue,mode)+'</body></html>',{waitUntil:'load'});
     await checkPrintLayout(page,editions[edition].minPrintSize,4);
     stage='OUTPUT';return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,...printPdfOptions(issue,mode)});
    }finally{await context.close().catch(()=>{});}
   }),attempt=>console.warn('pdf_browser_retry',{jobId:job.id,edition,mode,attempt}));
   const pages=(await PDFDocument.load(bytes)).getPageCount();if(pages<1||bytes.length>4_000_000)throw Error('PDF_SIZE_OR_PAGES');
   stage='STORAGE';if(upload)await upload(path,bytes);else{
    const {error}=await serviceDatabase().storage.from('issue-files').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(error)throw Error('PDF_STORAGE_FAILED');
   }
   const result:WebPdf={path,sha256:createHash('sha256').update(bytes).digest('hex'),pages,edition,mode};
   results.push(result);if(onFile)await onFile(result);
  }
  return results;
 }catch(error){
  const message=error instanceof Error?error.message:'Unknown PDF error';
  console.error('pdf_render_failed',{jobId:job.id,edition,mode:currentMode,stage,detail:message.replace(/https?:\/\/\S+/g,'[url]').slice(0,1400)});
  if(/^PDF_[A-Z_]+$/.test(message))throw error;
  throw Error('PDF_'+stage+'_FAILED');
 }
}
