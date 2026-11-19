import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readingMode} from '../lib/reader/mode.mjs';
import {validAssetPath} from '../lib/media/paths.mjs';
import {previewIssue,PREVIEW_DATE} from '../lib/reader/preview';
import provenance from '../content/reading-preview/provenance.json';

test('reading defaults to account-free preview; published access requires explicit selection',()=>{
  assert.equal(readingMode({}),'public');
  assert.equal(readingMode({READING_MODE:'',DEMO_MODE:'false'}),'public');
  assert.equal(readingMode({READING_MODE:'unknown'}),'public');
  assert.equal(readingMode({READING_MODE:'published'}),'published');
  assert.equal(readingMode({DEMO_MODE:'true',READING_MODE:'published'}),'demo');
});
test('bundled actual editions retain four stories and pending review status with intact files',async()=>{
  assert.equal(provenance.published,false);assert.equal(provenance.humanReviewCompleted,false);
  for(const edition of ['elementary','junior','senior'] as const){
    const issue=previewIssue(edition);
    assert.equal(issue.issueDate,PREVIEW_DATE);assert.equal(issue.articles.length,4);
    assert.equal(issue.isDemo,false);assert.equal(issue.reviewCopy,true);assert.equal(issue.publishedAt,null);
    for(const a of issue.articles)if(a.image.rendition){
      assert.ok(validAssetPath(a.image.rendition.webPath));
      assert.ok(validAssetPath(a.image.rendition.printPath));
    }
  }
  for(const [name,sha] of Object.entries(provenance.files)){
    const bytes=await readFile(`public/preview-issues/${PREVIEW_DATE}/${name}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),sha,name);
  }
});
test('preview asset paths stay local and reject traversal, remote hosts and executable content',()=>{
  const name='a'.repeat(64)+'-web.webp';
  assert.equal(validAssetPath(`/preview-issues/2026-11-19/assets/${name}`),true);
  for(const path of [`https://example.com/assets/${name}`,`//example.com/assets/${name}`,
    `/preview-issues/2026-11-19/../assets/${name}`,`/preview-issues/2026-11-19/assets/${name}?x=1`,
    '/preview-issues/2026-11-19/assets/script.svg'])assert.equal(validAssetPath(path),false);
});
