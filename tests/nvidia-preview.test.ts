import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {previewFacts,partialPreview,previewHtml,previewError,type PreviewReport} from '../lib/preview/nvidia';
import {demoIssue} from '../fixtures/issue';
import {hash} from '../lib/pipeline/state.mjs';

const facts=previewFacts(JSON.parse(await readFile('fixtures/stories.json','utf8')));
const report:PreviewReport={status:'needs_review',generatedAt:'2026-11-18T00:00:00Z',model:'synthetic-test-only',
  modelRequestAttempts:1,modelResponsesWithUsage:1,usageUnknownAttempts:0,inputTokens:10,outputTokens:20,
  costStatus:'cost_unknown',estimatedUsd:null,errorCode:'NEEDS_REVIEW:demo-1:elementary',pdfVerified:false,published:false};

test('API preview facts are eight owned fictional bundles with optional extra context',()=>{
  assert.equal(new Set(facts.map(f=>f.story_id)).size,8);
  assert(facts.every(f=>f.is_demo&&f.sources.length===1&&f.claims.length===3));
  assert(facts.every(f=>f.claims[0].must_keep&&!f.claims[1].must_keep&&!f.claims[2].must_keep));
  assert(facts.every(f=>f.sources[0].url==='https://example.org/demo-only'));
});
test('failed preview never fills missing model responses with fixture article bodies',()=>{
  assert(partialPreview({},facts).every(issue=>issue.isDemo&&issue.articles.length===0));
  const article=demoIssue('elementary').articles[0];
  const output={data:{headline:'Synthetic <script>only</script>',body_paragraphs:article.bodyParagraphs,
    vocabulary:article.vocabulary,used_claim_ids:['claim-1'],omitted_optional_claim_ids:[],editorial_flags:[]},usage:{input_tokens:10,output_tokens:20}};
  const records={'demo-1:elementary:write:0':{status:'success',output,outputHash:hash(output)}};
  const drafts=partialPreview(records,facts);
  assert.equal(drafts[0].articles.length,1);assert.equal(drafts[1].articles.length,0);assert.equal(drafts[2].articles.length,0);
  const html=previewHtml(drafts[0],report,'');
  assert(html.includes('&lt;script&gt;only&lt;/script&gt;'));assert(!html.includes('<script>only</script>'));
  assert(html.includes('尚未通過全部驗證'));assert(html.includes('PDF 尚未通過驗證'));assert(!html.includes('彩色 PDF</a>'));
  assert(html.includes('台北'));assert(html.includes('金額未確認'));
  assert.throws(()=>partialPreview({...records,'demo-1:elementary:write:0':{...records['demo-1:elementary:write:0'],outputHash:'tampered'}},facts),/PREVIEW_CHECKPOINT_CORRUPT/);
});
test('missing provider response is never described as successful generation; errors exclude raw secrets',()=>{
  const blank=partialPreview({},facts)[0];
  const html=previewHtml(blank,{...report,modelRequestAttempts:0,modelResponsesWithUsage:0},'');
  assert(html.includes('API 尚未取得生成回應'));assert(!html.includes('由 NVIDIA API 試寫'));
  assert.equal(previewError(Error('MODEL_HTTP_401')),'MODEL_HTTP_401');
  assert.equal(previewError(Error('secret-private-token-value')),'PREVIEW_FAILED');
});
