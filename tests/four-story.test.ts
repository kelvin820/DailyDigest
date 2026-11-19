import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoIssue} from '../fixtures/issue';
import {editionSchema} from '../lib/schemas/edition';
import {renderPrint} from '../lib/render.mjs';
import {validateIssue} from '../lib/content/core.mjs';
import {publishGate} from '../lib/pipeline/gates.mjs';
import {factSchema,reviewSchema} from '../lib/schemas/editorial';
import {hash} from '../lib/pipeline/state.mjs';

test('four-story snapshots validate, use four newspaper sections with natural pagination and retain legacy eight-story payloads',()=>{
  for(const edition of ['elementary','junior','senior'] as const){
    const legacy=demoIssue(edition);assert.equal(editionSchema.safeParse(legacy).success,true);
    const four={...legacy,storyCount:4 as const,reviewCopy:true,articles:legacy.articles.slice(0,4)};
    assert.equal(editionSchema.safeParse(four).success,true);assert.deepEqual(validateIssue(four),[]);
    const pages=renderPrint(four,'color').split('<section class="print-page flow-page">').slice(1);
    assert.equal(pages.length,1);for(const page of pages)assert.equal((page.match(/class="print-article"/g)||[]).length,4);
    assert.match(renderPrint({...four,isDemo:false},'color'),/試閱刊 · 尚未正式發布/);
    assert.equal(editionSchema.safeParse({...four,storyCount:8}).success,false);
    assert.equal(editionSchema.safeParse({...four,storyCount:undefined}).success,false);
  }
});
test('four-story publication gate needs twelve actual reviews and at least three categories',()=>{
  const issues=(['elementary','junior','senior'] as const).map(e=>({...demoIssue(e),storyCount:4 as 4|8,articles:demoIssue(e).articles.slice(0,4)}));
  const facts=issues[0].articles.map(a=>({story_id:a.storyId,event_key:a.storyId,primary_category:a.category,content_kind:a.contentKind,published_at:'2026-11-17T00:00:00Z',sensitivity:'low',claims:[{}],sources:a.sources.map(source=>({url:source.url,publisher:source.publisher,published_at:source.publishedAt}))}));
  const reviews=issues.flatMap(e=>e.articles.map(a=>({storyId:a.storyId,edition:e.edition,...reviewSchema.parse({factual_status:'pass',level_fit:'suitable',publish_recommendation:'pass',suitability:'pass',issues:[]})})));
  const files=issues.flatMap(e=>['color','ink'].map(mode=>({edition:e.edition,mode,pages:2,noOverflow:true,textVerified:true,fontsEmbedded:true,revision:e.revision,issueDate:e.issueDate,templateVersion:e.templateVersion,contentHash:hash(e)})));
  const base={editions:issues,facts:facts as unknown as import('zod').z.infer<typeof factSchema>[],reviews,files,live:false};
  assert.deepEqual(publishGate(base).errors,[]);assert.equal(publishGate({...base,reviews:reviews.slice(1)}).pass,false);
  assert.equal(publishGate({...base,files:files.map((f,i)=>({...f,pages:i%2?3:1}))}).pass,true);
  assert.equal(publishGate({...base,files:files.map((f,i)=>({...f,qualityValidated:i!==0}))}).pass,false);
  assert.equal(publishGate({...base,files:files.map(f=>({...f,pages:0}))}).pass,false);
  const mixed=structuredClone(issues);mixed[1].storyCount=8;
  assert.equal(publishGate({...base,editions:mixed}).pass,false);
});
