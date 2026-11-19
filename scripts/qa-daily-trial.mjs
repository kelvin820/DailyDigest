import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {localServer} from '../lib/pdf/local-server.mjs';
import {vocabularyOverlapErrors} from '../lib/content/vocabulary.mjs';
const directory=resolve(process.argv[2]||'output/daily-production-trial');
const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
const issues=JSON.parse(await readFile(resolve(directory,'editions.json'),'utf8'));
assert.equal(report.status,'review_copy_ready');assert.equal(report.pdfVerified,true);
assert.equal(report.published,false);assert.equal(report.databaseWritten,false);
assert.deepEqual(vocabularyOverlapErrors(issues),[]);
const server=await localServer(directory),browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
const errors=[],checks=[];
await mkdir(resolve(directory,'qa'),{recursive:true});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():route.abort());
 for(const issue of issues)for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(`${server.origin}/${issue.edition}.html`);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,stories:document.querySelectorAll('article.article').length,
   loaded:[...document.images].every(img=>img.complete&&img.naturalWidth>0),notice:document.querySelector('.notice').textContent}));
  assert.equal(state.overflow,false);assert.equal(state.stories,4);assert.equal(state.loaded,true);assert.match(state.notice,/試閱刊.*尚未正式發布/);
  for(const article of issue.articles)assert.equal(await page.locator('.body-copy').filter({hasText:article.bodyParagraphs[0]}).count(),1);
  checks.push({edition:issue.edition,width,...state});
  if(width!==768)await page.screenshot({path:resolve(directory,'qa',issue.edition+'-'+width+'.png'),fullPage:true});
 }
 await page.goto(`${server.origin}/elementary.html`);await page.getByRole('link',{name:'國中版',exact:true}).click();assert.match(page.url(),/junior.html$/);
 const byStory=new Map();for(const issue of issues)for(const a of issue.articles)if(a.image.kind==='generated_illustration'){
  if(!byStory.has(a.storyId))byStory.set(a.storyId,new Set());assert.ok(!byStory.get(a.storyId).has(a.image.assetId),'Generated images must differ across audiences');byStory.get(a.storyId).add(a.image.assetId);
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(directory,'qa/verification.json'),JSON.stringify({status:'passed',checks,navigation:true,glossaryTermsDistinct:true,generatedAudienceAssetsDistinct:true,pageErrors:errors},null,2));
 console.log('PASS: nine reader viewports, full article text, images, navigation and distinct learning terms/audience assets.');
}finally{await browser.close();await server.close();}
