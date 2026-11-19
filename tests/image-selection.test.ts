import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectIssueImages,shareSelectedImages,applyAudienceImages,type ImageStory,type ImageCandidate} from '../lib/media/select';
import {articleSchema} from '../lib/schemas/edition';
import {demoIssue} from '../fixtures/issue';

const photo={kind:'file_photo',alt:'Park bench',caption:'資料照，非現場',author:'Test',publisher:'Test',
  credit:'Test / CC0',licenseCode:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
  sourcePage:'https://example.org/bench',originalUrl:'https://example.org/bench.jpg',rightsConfirmed:true,photographedAt:null};
const generated={...photo,kind:'generated_illustration',credit:'Test AI',licenseCode:'GENERATED',
  generation:{provider:'fixture-test-only',model:'fixture-test-only',prompt:'Conceptual park',generatedAt:'2026-11-18T00:00:00Z'}};
const image=(record:typeof photo|typeof generated)=>articleSchema.shape.image.parse({assetId:'a'.repeat(64),alt:record.alt,caption:record.caption,
  kind:record.kind,credit:record.credit,licenseUrl:record.licenseUrl,sourcePage:record.sourcePage,
  rendition:{webPath:'assets/'+'a'.repeat(64)+'-web.webp',printPath:'assets/'+'a'.repeat(64)+'-print.jpg',width:1200,height:800}});
const candidate=(id:string,record:unknown):ImageCandidate=>({id,relevant:true,matchesEvent:true,record});
const story=(id:string,candidates:ImageCandidate[]=[]):ImageStory=>({storyId:id,category:'world',
  illustrationUseful:true,conceptSafe:true,candidates});

test('authorized usable photo prevents budget reservation and generation even when AI is available',async()=>{
  let budgetCalls=0,generationCalls=0;
  const selected=await selectIssueImages({stories:[story('one',[candidate('ai',generated),candidate('photo',photo)])],
    loadCandidate:async(_c,r)=>image(r as typeof photo),reserveGeneration:async()=>{budgetCalls++;return true;},
    generateConcept:async()=>{generationCalls++;return{record:generated,image:image(generated)};}});
  assert.equal(selected[0].image.kind,'file_photo');assert.equal(selected[0].reason,'existing_file_photo');
  assert.equal(budgetCalls,0);assert.equal(generationCalls,0);
});

test('unrelated, unlicensed and mismatched event photos cannot bypass selection; broken photo tries the next asset',async()=>{
  const loaded:string[]=[];
  const candidates=[candidate('bad-rights',{...photo,rightsConfirmed:false}),
    {...candidate('unrelated',photo),relevant:false},
    {...candidate('wrong-event',{...photo,kind:'event_photo'}),matchesEvent:false},
    candidate('broken',photo),candidate('usable',photo)];
  const selected=await selectIssueImages({stories:[story('one',candidates)],loadCandidate:async c=>{
    loaded.push(c.id);if(c.id==='broken')throw Error('Network failure');return image(photo);}});
  assert.deepEqual(loaded,['broken','usable']);assert.equal(selected[0].image.kind,'file_photo');
});

test('only missing useful safe images generate, at most two reservations; failures consume the slot and Taipei day is used',async()=>{
  const reservations:unknown[]=[];let calls=0;
  const selected=await selectIssueImages({stories:[story('one'),story('two'),story('three'),
    {...story('unsafe'),conceptSafe:false}],now:new Date('2026-11-17T17:00:00Z'),loadCandidate:async()=>null,
    reserveGeneration:async request=>{reservations.push(request);return true;},generateConcept:async()=>{
      calls++;if(calls===1)throw Error('Service failed');return{record:generated,image:image(generated)};}});
  assert.equal(calls,2);assert.equal(selected[0].reason,'icon_generation_failed');
  assert.equal(selected[1].image.kind,'generated_illustration');assert.equal(selected[2].reason,'icon_generation_limit');
  assert.equal(selected[3].reason,'icon_concept_not_suitable');
  assert.deepEqual(reservations,[{day:'2026-11-18',storyId:'one',limit:2},{day:'2026-11-18',storyId:'two',limit:2}]);
});

test('missing shared budget disables new generation; one selected image is reused by all three editions without changing text',async()=>{
  let calls=0;
  const selected=await selectIssueImages({stories:Array.from({length:8},(_,i)=>story('demo-'+(i+1))),
    loadCandidate:async()=>null,generateConcept:async()=>{calls++;return{record:generated,image:image(generated)};}});
  assert.equal(calls,0);assert.ok(selected.every(s=>s.reason==='icon_daily_budget_unavailable'));
  selected[0].image=image(photo) as typeof selected[number]['image'];
  const original=['elementary','junior','senior'].map(e=>demoIssue(e as 'elementary'|'junior'|'senior'));
  const editions=shareSelectedImages(original,selected);
  assert.ok(editions.every(e=>e.articles[0].image.kind==='file_photo'));
  assert.deepEqual(editions.map(e=>e.articles.map(a=>a.bodyParagraphs)),original.map(e=>e.articles.map(a=>a.bodyParagraphs)));
  editions[0].articles[0].image.caption='Different crop note';assert.notEqual(editions[1].articles[0].image.caption,'Different crop note');
});


test('three audiences receive distinct illustrations while shared photos and all article text stay intact',()=>{
 const issues=['elementary','junior','senior'].map(e=>demoIssue(e as 'elementary'|'junior'|'senior'));
 const selections=Object.fromEntries(issues.map(issue=>[issue.edition,issue.articles.map((a,i)=>({storyId:a.storyId,
  image:i===0?{...image(generated),assetId:issue.edition}:i===1?image(photo):a.image,reason:'synthetic-test',generationAttempted:false,notes:[]}))]));
 const updated=applyAudienceImages(issues,selections);
 assert.equal(new Set(updated.map(i=>i.articles[0].image.assetId)).size,3);
 assert.equal(new Set(updated.map(i=>i.articles[1].image.assetId)).size,1);
 assert.deepEqual(updated.map(i=>i.articles.map(a=>a.bodyParagraphs)),issues.map(i=>i.articles.map(a=>a.bodyParagraphs)));
 assert.throws(()=>applyAudienceImages(issues,{elementary:selections.elementary}),/AUDIENCE_IMAGE_SELECTION_REQUIRED/);
});
