import {parseArgs} from 'node:util';
import {copyFile,cp,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {photoRecord,toolImagePrompt} from '../config/image-preview.mjs';
import {downloadAsset,prepareAsset,type AssetRecord} from '../lib/media/prepare';
import {articleSchema} from '../lib/schemas/edition';
import {previewHtml,type PreviewEdition,type PreviewReport} from '../lib/preview/nvidia';
import {renderIssues} from './render';
import {demoIssue} from '../fixtures/issue';
import {editionKeys} from '../config/editions';
import {esc} from '../lib/render.mjs';
import {selectIssueImages,shareSelectedImages} from '../lib/media/select';

const {values}=parseArgs({options:{out:{type:'string',default:'output/image-preview'},
  comparison:{type:'string'},photo:{type:'string'},illustration:{type:'string'},nvidia:{type:'string'},'skip-pdf':{type:'boolean',default:false}}});
if(!values.comparison||!values.illustration)throw Error('Pass --comparison <verified comparison directory> --illustration <tool-generated PNG>');
const directory=resolve(values.out),comparison=resolve(values.comparison);
await mkdir(directory,{recursive:true});
const photo=values.photo?await prepareAsset(await readFile(values.photo),'image/jpeg',photoRecord as AssetRecord,directory):
  await downloadAsset(photoRecord as AssetRecord,['upload.wikimedia.org'],directory);
photo.image.focalPoint={x:50,y:65};
const generated=await prepareAsset(await readFile(values.illustration),'image/png',{
  kind:'generated_illustration',alt:'Watercolor sketchbook with park planning drawings and colored pencils beneath leafy trees.',
  caption:'公園規劃概念，非事件照片。',author:'DayDay / ChatGPT image generation tool',publisher:'DayDay',
  credit:'DayDay · ChatGPT 生成',licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,
  generation:{provider:'ChatGPT image generation tool',model:'not exposed by tool',prompt:toolImagePrompt,
    generatedAt:(await stat(values.illustration)).mtime.toISOString()},
},directory);

const variants:{key:string;label:string;image:typeof photo.image|null;provenance:string}[]=[
  {key:'generated',label:'AI 插畫',image:generated.image,provenance:'本次由 ChatGPT 圖片工具實際生成；不是 NVIDIA API 的結果。'},
  {key:'photo',label:'資料照片',image:photo.image,provenance:'Wikimedia Commons 的 CC0 照片，已下載及重新編碼；不是本次事件現場。'},
  {key:'icon',label:'分類圖示',image:null,provenance:'DayDay 自有分類圖示；不需圖片 API。'},
];
let nvidiaReport:unknown=null;
if(values.nvidia){
  const nvidiaDir=resolve(values.nvidia);
  const report=JSON.parse(await readFile(resolve(nvidiaDir,'report.json'),'utf8'));
  nvidiaReport=report;
  if(report.status==='generated'&&report.imagesGenerated===1){
    const image=articleSchema.shape.image.parse(JSON.parse(await readFile(resolve(nvidiaDir,'image.json'),'utf8')));
    if(image.kind!=='generated_illustration'||!image.rendition)throw Error('NVIDIA_IMAGE_NOT_VERIFIED');
    const manifest=JSON.parse(await readFile(resolve(nvidiaDir,'assets',image.assetId+'.json'),'utf8'));
    const bytes=await readFile(resolve(nvidiaDir,image.rendition.printPath));
    // Independently re-decode downloaded artifact; keep original NVIDIA manifest/provenance.
    const verified=await prepareAsset(bytes,'image/jpeg',Object.fromEntries(Object.entries(manifest).filter(([key])=>
      ['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl',
        'rightsConfirmed','photographedAt','generation'].includes(key))) as AssetRecord,directory);
    variants.unshift({key:'nvidia',label:'NVIDIA 插畫',image:verified.image,provenance:'GitHub Actions 使用 NVIDIA API 實際生成；一次請求。費用未確認，尚未接每日出刊。'});
    await copyFile(resolve(nvidiaDir,'report.json'),resolve(directory,'nvidia-image-report.json'));
  }else await copyFile(resolve(nvidiaDir,'report.json'),resolve(directory,'nvidia-image-report.json'));
}

const issues=z.array(z.custom<PreviewEdition>()).parse(JSON.parse(await readFile(resolve(comparison,'display-editions.json'),'utf8')));
if(issues.length!==3||new Set(issues.map(i=>i.edition)).size!==3||issues.some(i=>!i.isDemo||i.articles.length!==1))throw Error('VERIFIED_SINGLE_STORY_COMPARISON_REQUIRED');
issues.forEach(issue=>issue.articles.forEach(a=>articleSchema.parse(a)));
const autoSelections=await selectIssueImages({stories:[{storyId:issues[0].articles[0].storyId,
  category:issues[0].articles[0].category,illustrationUseful:true,conceptSafe:true,candidates:[
    {id:'authorized-photo',relevant:true,record:photoRecord},
    {id:'existing-concept',relevant:true,record:Object.fromEntries(Object.entries(generated.manifest).filter(([key])=>
      ['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl',
        'rightsConfirmed','photographedAt','generation'].includes(key)))},
  ]}],loadCandidate:async candidate=>candidate.id==='authorized-photo'?photo.image:generated.image});
const autoIssues=shareSelectedImages(issues,autoSelections);
if(autoSelections[0].reason!=='existing_file_photo'||autoSelections[0].generationAttempted)throw Error('PHOTO_FIRST_DEMO_POLICY_FAILED');
const primaryGenerated=variants.find(v=>v.key==='nvidia')||variants.find(v=>v.key==='generated')!;
variants.unshift({key:'auto',label:'自動選圖',image:photo.image,
  provenance:'這篇已找到合適的 CC0 資料照片，因此直接使用照片，不需呼叫生圖 API。其他插畫頁為獨立比較測試。'});
const report:PreviewReport=JSON.parse(await readFile(resolve(comparison,'report.json'),'utf8'));
report.developerNotes=[...(report.developerNotes||[]),'國中顯示稿已將原 API 詞義「蠔粉」修正為「蠟筆」，原始回應保留於 checkpoints.json。'];
const css=(await readFile('app/globals.css','utf8'))+'\n.image-tools{border-block:1px solid #20201e55;padding:18px 0;margin:18px 0}.image-tools nav{display:flex;flex-wrap:wrap;gap:10px}.image-tools nav a{padding:8px 12px;border:1px solid #20201e55;text-decoration:none}.image-tools nav a[aria-current=page]{background:var(--accent);color:white}.image-tools p{font-size:12px;line-height:1.65}.image-tools h2{font:26px Georgia,serif;margin:0 0 16px}';
await cp(resolve(comparison,'fonts'),resolve(directory,'fonts'),{recursive:true});
await copyFile('public/media-fallback.js',resolve(directory,'media-fallback.js'));
for(const file of ['report.json','checkpoints.json','developer-corrections.json']){
  await copyFile(resolve(comparison,file),resolve(directory,file));
}
const pdfVariants=['photo',primaryGenerated.key];
for(const variant of variants){
  for(const issue of issues){
    const updated=structuredClone(variant.key==='auto'?autoIssues.find(i=>i.edition===issue.edition)!:issue);
    if(variant.image)updated.articles[0].image=variant.image;
    const pdfKey=variant.image?.kind==='file_photo'?'photo':pdfVariants[1];
    const pdfLabel=pdfKey==='photo'?'資料照片':primaryGenerated.label;
    const pdfName=`DD_${issue.issueDate}_${issue.edition}_r1_`;
    const tools='<section class="image-tools" aria-label="圖片測試"><h2>配圖實驗室</h2><nav>'+variants.map(v=>
      `<a href="${issue.edition}-${v.key}.html"${v.key===variant.key?' aria-current="page"':''}>${esc(v.label)}</a>`).join('')+
      '</nav><p>'+esc(variant.provenance)+'</p><p>三版共用同一圖檔，保留原表頭與正文。'+
      (values['skip-pdf']?'PDF 尚未執行。':`兩頁虛構樣刊（配圖：${esc(pdfLabel)}）：<a href="pdf-${pdfKey}/${pdfName}color.pdf">彩色 PDF</a> · <a href="pdf-${pdfKey}/${pdfName}ink.pdf">省墨 PDF</a>（八篇舊樣稿，僅第一篇測配圖）`)+
      '</p><details><summary>來源與測試記錄</summary><p><a href="image-report.json">圖片處理記錄</a> · '+
      (nvidiaReport?'<a href="nvidia-image-report.json">NVIDIA 圖片 API 結果</a> · ':'')+
      '<a href="../nemotron/elementary">原文字生成比較</a> · <a href="../image-probes/">圖片 API 實測</a></p></details></section>';
    let html=previewHtml(updated,report,css);
    html=html.replace(/href="(elementary|junior|senior)\.html"/g,(_match,key)=>`href="${key}-${variant.key}.html"`)
      .replace(/<div class="preview-meta">([\s\S]*?)<\/div>/,(_match,content)=>tools+'<details class="preview-review"><summary>文字生成來源與用量</summary><div class="preview-meta">'+content+'</div></details>')
      .replace(/<div class="preview-error">([\s\S]*?)<\/div>/g,'<details class="preview-review"><summary>詞義修訂記錄</summary>$1</details>');
    const audit:string[]=[];
    html=html.replace(/<details class="preview-review">[\s\S]*?<\/details>/g,section=>{audit.push(section);return '';});
    html=html.replace('<footer>','<details class="image-audit"><summary>查看文字生成與詞義修訂記錄</summary>'+audit.join('')+'</details><footer>');
    await writeFile(resolve(directory,`${issue.edition}-${variant.key}.html`),html);
  }
}
await writeFile(resolve(directory,'index.html'),`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=elementary-${variants[0].key}.html"><a href="elementary-${variants[0].key}.html">開啟圖片測試</a>`);
const pdfResults=[];
if(!values['skip-pdf'])for(const key of pdfVariants){
  const variant=variants.find(v=>v.key===key)!;
  const pdfDir=resolve(directory,'pdf-'+key);
  await mkdir(pdfDir,{recursive:true});await cp(resolve(directory,'assets'),resolve(pdfDir,'assets'),{recursive:true});
  const editions=editionKeys.map(edition=>{
    const issue=demoIssue(edition);if(variant.image)issue.articles[0].image=variant.image;return issue;
  });
  pdfResults.push({variant:key,files:await renderIssues(editions,pdfDir)});
}
await writeFile(resolve(directory,'image-report.json'),JSON.stringify({status:'image_demo',isDemo:true,
  generatedAt:new Date().toISOString(),variants:variants.map(v=>({key:v.key,provenance:v.provenance,assetId:v.image?.assetId??'world'})),
  photo:photo.manifest,toolIllustration:generated.manifest,nvidiaReport,autoSelections,
  newImageApiCallsInThisBuild:0,pdfVerified:!values['skip-pdf'],
  pdfResults,databaseWritten:false,published:false,automaticImageGenerationEnabled:false},null,2));
console.log('Image preview built: '+variants.length+' choices × 3 editions; '+pdfResults.length*6+' verified two-page DEMO PDFs.');
