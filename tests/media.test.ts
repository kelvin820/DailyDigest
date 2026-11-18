import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {assetRecordSchema,prepareAsset,type AssetRecord} from '../lib/media/prepare';
import {generateNvidiaImage} from '../lib/providers/image';
import {renderFigure} from '../lib/render.mjs';
import {demoIssue} from '../fixtures/issue';

const record:AssetRecord={kind:'file_photo',alt:'An empty park bench',caption:'主題配圖',author:'Test',publisher:'Test',
  credit:'Test / CC0',licenseCode:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
  sourcePage:'https://commons.wikimedia.org/wiki/File:Bench.jpg',originalUrl:'https://upload.wikimedia.org/bench.jpg',
  rightsConfirmed:true,photographedAt:null};

test('photo rights must be explicit; unknown, CC BY-SA and absent provenance fail closed',()=>{
  for(const patch of [{rightsConfirmed:false},{licenseCode:'CC_BY_SA'},{licenseUrl:undefined},{sourcePage:undefined}])
    assert.equal(assetRecordSchema.safeParse({...record,...patch}).success,false);
  assert.equal(assetRecordSchema.safeParse({...record,kind:'generated_illustration',licenseCode:'GENERATED'}).success,false);
});

test('raster pipeline checks MIME, rejects SVG/oversize and strips metadata with bounded web rendition',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dayday-media-'));
  try{
    const pixels=Buffer.alloc(1800*1200*3);
    for(let i=0;i<pixels.length;i++)pixels[i]=i%251;
    const bytes=await sharp(pixels,{raw:{width:1800,height:1200,channels:3}})
      .withMetadata({exif:{IFD0:{Artist:'Private camera metadata'}}}).jpeg().toBuffer();
    const result=await prepareAsset(bytes,'image/jpeg',record,directory);
    const web=await sharp(await readFile(join(directory,result.image.rendition.webPath))).metadata();
    assert.equal(web.width,1200);assert.equal(web.height,800);assert.equal(web.exif,undefined);
    assert.equal(result.image.assetId.length,64);
    await assert.rejects(prepareAsset(bytes,'image/png',record,directory),/IMAGE_RASTER_INVALID/);
    await assert.rejects(prepareAsset(Buffer.from('<svg/>'),'image/svg+xml',record,directory),/IMAGE_MIME_REJECTED/);
    await assert.rejects(prepareAsset(Buffer.alloc(10_000_001),'image/jpeg',record,directory),/IMAGE_SIZE_LIMIT/);
    const blank=await sharp({create:{width:256,height:256,channels:3,background:'#000'}}).png().toBuffer();
    await assert.rejects(prepareAsset(blank,'image/png',record,directory),/IMAGE_EMPTY_OR_FLAT/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('shared renderer distinguishes photo / AI / icon, escapes metadata and rejects hostile rendition paths',()=>{
  const article=demoIssue('elementary').articles[0];
  const rendition={webPath:'assets/'+'a'.repeat(64)+'-web.webp',printPath:'assets/'+'a'.repeat(64)+'-print.jpg',width:1200,height:800};
  const input={...article,image:{...article.image,kind:'file_photo',credit:'<script>bad</script>',rendition}};
  assert.match(renderFigure(input),/資料照片 · 非本次現場/);
  assert.match(renderFigure(input),/bad&lt;\/script&gt;/);
  assert.match(renderFigure(input,true),/-print.jpg/);
  assert.match(renderFigure({...input,image:{...input.image,kind:'generated_illustration'}}),/AI illustration/);
  for(const path of ['https://evil.test/a.jpg','javascript:alert(1)','../private.jpg','assets/%2e%2e/a.jpg']){
    const html=renderFigure({...input,image:{...input.image,rendition:{...rendition,webPath:path}}});
    assert.doesNotMatch(html,/<img/);assert.match(html,/備援/);
  }
});

test('NVIDIA image adapter issues one fixed-endpoint request, accepts one raster and never retries failures',async()=>{
  const png=await sharp({create:{width:256,height:256,channels:3,background:'#abc'}}).png().toBuffer();
  let calls=0;
  const fetcher:typeof fetch=async(url,options)=>{
    calls++;assert.equal(url,'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b');
    const body=JSON.parse(String(options?.body));assert.equal(body.steps,4);
    assert.deepEqual(Object.keys(body).sort(),['height','prompt','steps','width']);
    return new Response(JSON.stringify({artifacts:[{base64:png.toString('base64')}]}));
  };
  assert.equal((await generateNvidiaImage('test-key',{fetcher})).mime,'image/png');assert.equal(calls,1);
  await assert.rejects(generateNvidiaImage('test-key',{fetcher:async()=>{calls++;return new Response('sensitive error',{status:410});}}),/^Error: IMAGE_HTTP_410$/);
  assert.equal(calls,2);
  await assert.rejects(generateNvidiaImage('test-key',{fetcher:async()=>new Response(JSON.stringify({artifacts:[{base64:'PHN2Zy8+'}]}))}),/IMAGE_MIME_REJECTED/);
});
