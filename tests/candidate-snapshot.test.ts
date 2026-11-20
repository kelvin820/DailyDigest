import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../lib/pipeline/state.mjs';
import {restoreCandidateSnapshot} from '../lib/editorial/candidate-snapshot';
import type {NewsCandidate} from '../lib/editorial/news-config';
test('shortlist reranking restores exact original checkpoint metadata without changing source identity',()=>{
 const original:NewsCandidate={id:'one',sourceId:'guardian-life',url:'https://www.theguardian.com/story',publisher:'The Guardian',publishedAt:'2026-11-13T06:00:00Z',category:'culture',title:'Original story',excerpt:'',score:90,titleZh:'原始標題'};
 const ranked={...original,score:85,titleZh:'重新選題標題'};
 assert.deepEqual(restoreCandidateSnapshot(ranked,hash(original),[original]),original);
 assert.throws(()=>restoreCandidateSnapshot({...ranked,url:'https://www.theguardian.com/different'},hash(original),[original]),/CHECKPOINT_CHANGED/);
 assert.throws(()=>restoreCandidateSnapshot(ranked,hash(original),[]),/CHECKPOINT_CHANGED/);
 assert.throws(()=>restoreCandidateSnapshot({...ranked,publishedAt:'2026-11-14T06:00:00Z'},hash(original),[original]),/CHECKPOINT_CHANGED/);
});
