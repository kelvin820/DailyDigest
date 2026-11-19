import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {benchmarkRuns} from '../lib/editorial/benchmarks';
import {hash} from '../lib/pipeline/state.mjs';

for(const report of benchmarkRuns){
 const{fingerprint,...body}=report;assert.equal(hash(body),fingerprint,'REVIEW_FINGERPRINT_CHANGED');
 assert.equal(report.published,false);assert.equal(report.databaseWritten,false);
 for(const r of report.rounds){
  assert.equal(r.apiMs,r.drafts.filter(d=>!d.reused).reduce((s,d)=>s+d.writerMs+d.reviewerMs,0),'REVIEW_TIMING_CHANGED');
  assert.equal(r.firstPass,r.drafts.filter(d=>!d.reused&&d.firstPass).length,'FIRST_PASS_COUNT_CHANGED');
  assert.equal(new Set(r.drafts.map(d=>d.storyId+':'+d.edition)).size,r.drafts.length,'DUPLICATE_DRAFT');
 }
 for(const f of report.pdfFiles){
  assert.ok(f.path.startsWith('/benchmarks/'+report.id+'/')&&!f.path.includes('..'),'INVALID_REVIEW_ASSET');
  const bytes=await readFile(resolve('public','.'+f.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,'REVIEW_PDF_CHANGED');
 }
}
console.log(`Verified ${benchmarkRuns.length} immutable review comparisons, timings and PDF hashes; none released.`);
