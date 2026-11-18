import {parseArgs} from 'node:util';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {articleSchema} from '../lib/schemas/edition';
import {esc} from '../lib/render.mjs';

const {values}=parseArgs({options:{run:{type:'string',multiple:true},out:{type:'string',default:'output/image-probes'}}});
if(!values.run?.length)throw Error('VERIFIED_IMAGE_RUNS_REQUIRED');
const out=resolve(values.out);await mkdir(resolve(out,'assets'),{recursive:true});
const cards=[],evidence=[];
for(const input of values.run){
  const directory=resolve(input),id=basename(directory);
  if(!/^\d+$/.test(id))throw Error('NUMERIC_RUN_DIRECTORY_REQUIRED');
  const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
  if(!(report.status==='generated'&&report.imagesGenerated===1)&&report.image?.status!=='generated')throw Error('IMAGE_RUN_NOT_SUCCESSFUL');
  const image=articleSchema.shape.image.parse(JSON.parse(await readFile(resolve(directory,'image.json'),'utf8')));
  if(image.kind!=='generated_illustration'||!image.rendition)throw Error('GENERATED_RASTER_REQUIRED');
  const manifest=JSON.parse(await readFile(resolve(directory,'assets',image.assetId+'.json'),'utf8'));
  const bytes=await readFile(resolve(directory,image.rendition.webPath));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.web.sha256)throw Error('IMAGE_HASH_MISMATCH');
  const raster=sharp(bytes,{limitInputPixels:40_000_000}),metadata=await raster.metadata(),quality=await raster.stats();
  if(!metadata.width||!metadata.height||metadata.width>1200||metadata.height>1200||quality.channels.slice(0,3).every(c=>c.stdev<2))throw Error('IMAGE_QUALITY_FAILED');
  await copyFile(resolve(directory,image.rendition.webPath),resolve(out,image.rendition.webPath));
  await writeFile(resolve(out,'report-'+id+'.json'),JSON.stringify(report,null,2));
  const generation=manifest.generation,provider=generation?.provider;
  if(!['nvidia','google'].includes(provider))throw Error('REAL_IMAGE_PROVIDER_REQUIRED');
  const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'}).format(new Date(generation.generatedAt));
  const title=report.promptCase==='official_coffee'?'NVIDIA 官方範例 · 咖啡店':provider==='google'?'Google · 公園水彩插畫':'NVIDIA · 公園水彩插畫';
  cards.push('<article><h2>'+esc(title)+'</h2><figure><img src="'+esc(image.rendition.webPath)+'" alt="'+esc(image.alt)+'">'+
    '<figcaption>AI 生成示意圖 · 非事件照片 · '+esc(image.credit)+'</figcaption></figure><p class="model">'+esc(generation.model)+'</p><p>'+esc(time)+'（台北）</p>'+
    '<details><summary>提示詞與實測記錄</summary><p>'+esc(generation.prompt)+'</p><p><a href="report-'+id+'.json">結果記錄</a> · '+
    '<a href="https://github.com/kelvin820/DailyDigest/actions/runs/'+id+'">GitHub 實際執行</a></p></details></article>');
  evidence.push({runId:id,provider,model:generation.model,assetId:image.assetId,webSha256:manifest.web.sha256,width:metadata.width,height:metadata.height});
}
await writeFile(resolve(out,'index.html'),'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>圖片 API 實測 · DayDay</title><style>'+ 
  '*{box-sizing:border-box}body{margin:0;background:#f4eee2;color:#20201e;font-family:Arial,"Noto Sans CJK TC",sans-serif}main{max-width:1200px;margin:auto;padding:28px 24px}a{color:#285e51;text-underline-offset:4px}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:13px}header{margin:28px 0;border-block:3px double;padding:20px 0}.brand{font:bold 15px Georgia,serif;letter-spacing:3px}h1{font:clamp(28px,5vw,48px) Georgia,serif;margin:18px 0}header p{font-size:14px;line-height:1.8;max-width:760px}.tag{display:inline-block;background:#285e51;color:white;padding:5px 8px;font-size:11px;letter-spacing:1px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:30px}article{min-width:0;border-top:1px solid;padding-top:14px}h2{font-size:20px;margin:0 0 16px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{font-size:11px;line-height:1.6;margin:8px 0;color:#514e45}.model{font-size:13px;font-weight:bold;overflow-wrap:anywhere}article p,details{font-size:12px;line-height:1.75}summary{cursor:pointer}footer{margin-top:36px;padding:20px 0;border-top:1px solid;font-size:12px}a:focus-visible,summary:focus-visible{outline:3px solid #285e51;outline-offset:4px}</style><body><main><nav><a href="../images/">回配圖比較</a><a href="../nemotron/elementary">NVIDIA 三版文字稿</a></nav>'+ 
  '<header><div class="brand">DAILY DIGEST / DAYDAY</div><h1>圖片 API 實測</h1><span class="tag">REAL API OUTPUT · DEMO</span><p>以下圖片已透過標示的 API 實際生成、下載及檢查。公園插畫用於概念展示，咖啡店為獨立基礎範例。DayDay 的選圖原則仍是先用合適的授權圖片，缺圖才考慮生成插畫。</p></header><section class="grid">'+cards.join('')+'</section><footer>開發測試 · 未寫入出刊資料庫、未自動出刊 · 費用尚未核對</footer></main></body></html>');
await writeFile(resolve(out,'evidence.json'),JSON.stringify({actualApiImages:evidence,databaseWritten:false,published:false},null,2));
console.log('Prepared '+cards.length+' verified actual API image samples.');
