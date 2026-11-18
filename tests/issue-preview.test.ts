import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatedPreviewCheckpoints} from '../lib/preview/checkpoints';
import {cachedStep,hash} from '../lib/pipeline/state.mjs';
import {previewFacts,partialPreview,previewHtml} from '../lib/preview/nvidia';
import stories from '../fixtures/stories.json';

test('resumed preview checkpoints require valid step addresses and untampered output hashes',async()=>{
  const input={fact:'owned-fiction',prompt:'one'},output={data:{fixture:'test-only'},usage:{input_tokens:10,output_tokens:2}};
  const key='demo-1:elementary:write:0';
  const records=validatedPreviewCheckpoints({[key]:{status:'success',inputHash:hash(input),output,outputHash:hash(output)}});
  let calls=0;
  const store={get:async(k:string)=>records[k],set:async(k:string,value:typeof records[string])=>{records[k]=value;}};
  assert.deepEqual(await cachedStep(store,key,input,async()=>{calls++;return output;}),output);assert.equal(calls,0);
  await cachedStep(store,key,{...input,prompt:'changed'},async()=>{calls++;return output;});assert.equal(calls,1);
  assert.throws(()=>validatedPreviewCheckpoints({[key]:{...records[key],output:{modified:true}}}),/PREVIEW_CHECKPOINT_CORRUPT/);
  assert.throws(()=>validatedPreviewCheckpoints({'../arbitrary':records[key]}));
});

test('a zero-call resumed preview labels reused API responses without claiming fresh generation',()=>{
  const issue=partialPreview({},previewFacts(stories))[0];
  const html=previewHtml(issue,{status:'needs_review',generatedAt:'2026-11-18T00:00:00Z',model:'fixture-test-only',
    modelRequestAttempts:0,modelResponsesWithUsage:0,usageUnknownAttempts:0,inputTokens:0,outputTokens:0,
    costStatus:'cost_unknown',estimatedUsd:null,errorCode:null,pdfVerified:false,published:false,reusedModelSteps:2},'');
  assert.match(html,/重用先前的實際 NVIDIA API 回應/);assert.match(html,/本輪沒有新增文字生成/);
  assert.doesNotMatch(html,/API 尚未取得生成回應/);
});
