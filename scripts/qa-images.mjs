import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {localServer} from '../lib/pdf/local-server.mjs';
import {checkPrintLayout} from '../lib/pdf/print-checks.mjs';

const directory=resolve(process.argv[2]||'output/image-preview');
const report=JSON.parse(await readFile(resolve(directory,'image-report.json'),'utf8'));
const variants=report.variants.map(v=>v.key),editions=['elementary','junior','senior'];
const server=await localServer(directory);
const browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
const checks=[],errors=[];
await mkdir(resolve(directory,'qa'),{recursive:true});
try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():route.abort());
  const sharedIds=new Map();
  for(const edition of editions)for(const variant of variants)for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:1000});
    await page.goto(`${server.origin}/${edition}-${variant}.html`);
    await page.evaluate(()=>document.fonts.ready);
    if(variant!=='icon')await page.locator('.article img').evaluate(img=>img.decode());
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      id:document.querySelector('.media-figure')?.dataset.assetId,
      image:[...document.querySelectorAll('.article img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight,
        bottom:i.getBoundingClientRect().bottom,caption:i.closest('figure').querySelector('.asset-credit').textContent})),
      body:document.querySelector('.body-copy').textContent,
      tab:document.querySelector('.image-tools [aria-current=page]').textContent}));
    assert.equal(state.overflow,false,`${edition}/${variant}/${width} overflow`);
    if(variant!=='icon'){
      assert.equal(state.image.length,1);assert.ok(state.image[0].width<=1200&&state.image[0].height<=1200);
      if(sharedIds.has(variant))assert.equal(state.id,sharedIds.get(variant));else sharedIds.set(variant,state.id);
      assert.match(state.image[0].caption,['auto','photo'].includes(variant)?/資料照片 · 非本次現場/:/AI illustration/);
    }
    assert.ok(state.body.length>100);checks.push({edition,variant,width,passed:true,assetId:state.id??'world'});
    if(width===375||width===1440)await page.screenshot({path:resolve(directory,'qa',`${edition}-${variant}-${width}.png`),fullPage:true});
  }
  // Actually follow the visible image and edition controls.
  await page.goto(`${server.origin}/elementary-generated.html`);
  await page.getByRole('link',{name:'資料照片',exact:true}).click();
  assert.match(page.url(),/elementary-photo.html$/);
  await page.locator('.preview-tabs a').nth(1).click();assert.match(page.url(),/junior-photo.html$/);
  await page.getByRole('link',{name:'分類圖示',exact:true}).click();assert.match(page.url(),/junior-icon.html$/);

  // Simulate network/decoder failure: the visible caption changes with the original icon.
  await page.route('**/assets/*-web.webp',route=>route.abort());
  await page.goto(`${server.origin}/elementary-generated.html`);
  await page.locator('.asset-fallback-credit').waitFor({state:'visible'});
  assert.equal(await page.locator('.asset-fallback svg').isVisible(),true);
  assert.equal(await page.locator('.asset-credit').isVisible(),false);

  // A broken print image must refuse PDF verification rather than producing a blank PDF.
  const printPage=await browser.newPage();
  await printPage.route('**/assets/*-print.jpg',route=>route.abort());
  await printPage.goto(`${server.origin}/pdf-${report.pdfResults[0].variant}/DD_2026-11-17_elementary_r1_color.html`);
  await assert.rejects(checkPrintLayout(printPage,13));
  assert.deepEqual(errors,[]);
  await writeFile(resolve(directory,'qa','verification.json'),JSON.stringify({status:'passed',checks,
    imageAndEditionNavigation:true,webLoadFailureFallback:true,missingPrintImageRefused:true,pageErrors:errors},null,2));
  console.log(`${checks.length} responsive image views, navigation, web fallback and print failure checks passed.`);
}finally{await browser.close();await server.close();}
