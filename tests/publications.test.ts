import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedIssues,publishedIssue,packetCanRelease,type Catalog,type Packet} from '../lib/publications/catalog';
import {demoIssue} from '../fixtures/issue';
import {validAssetPath} from '../lib/media/paths.mjs';

const release=(date:string,revision:number)=>({packetId:date+'-r'+revision,fingerprint:'a'.repeat(64),releasedAt:date+'T01:00:00Z',approvedBy:'editor',approvalMethod:'github_manual' as const,humanReviewCompleted:true,editions:(['elementary','junior','senior'] as const).map(edition=>({...demoIssue(edition),issueDate:date,revision,isDemo:false,reviewCopy:false,publishedAt:date+'T01:00:00Z'})),pdfPaths:{},files:{}});
test('only released dates appear in the archive, with the newest revision per date',()=>{
 const data:Catalog={version:1,packets:[],releases:[release('2026-11-18',1),release('2026-11-19',1),release('2026-11-18',2)]};
 assert.deepEqual(publishedIssues(data).map(r=>r.editions[0].issueDate),['2026-11-19','2026-11-18']);
 assert.equal(publishedIssue('junior',undefined,data)?.issueDate,'2026-11-19');
 assert.equal(publishedIssue('senior','2026-11-18',data)?.revision,2);
 assert.equal(publishedIssue('elementary','2026-11-17',data),null);
 assert.equal(publishedIssues({version:1,packets:[],releases:[]}).length,0);
});
test('review readiness never upgrades revise or uncertain assessments to pass',()=>{
 const good={storyId:'one',edition:'elementary',factual_status:'pass',level_fit:'suitable',suitability:'pass',publish_recommendation:'pass',issues:[]} as Packet['reviews'][number];
 const packet={reviews:Array.from({length:12},(_,i)=>({...good,storyId:'story-'+Math.floor(i/3),edition:['elementary','junior','senior'][i%3] as Packet['reviews'][number]['edition']}))} as Packet;
 assert.equal(packetCanRelease(packet),true);
 for(const patch of [{publish_recommendation:'revise'},{factual_status:'insufficient_evidence'},{level_fit:'uncertain'},{suitability:'needs_human_review'}])assert.equal(packetCanRelease({...packet,reviews:[{...good,...patch},...packet.reviews.slice(1)]} as Packet),false);
});
test('revision-specific bundled assets cannot escape their local directory',()=>{
 const name='b'.repeat(64)+'-print.jpg';
 assert.equal(validAssetPath('/preview-issues/2026-11-19/r2/assets/'+name),true);
 assert.equal(validAssetPath('/preview-issues/2026-11-19/r0/assets/'+name),false);
 assert.equal(validAssetPath('/preview-issues/2026-11-19/r2/../assets/'+name),false);
});
