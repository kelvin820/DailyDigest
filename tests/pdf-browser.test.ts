import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverClosedBrowser} from '../lib/pdf/browser-retry';
test('a closed PDF browser is replaced once; content or storage failures never cause browser retries',async()=>{
 let attempts=0,retries=0;
 const value=await recoverClosedBrowser(async()=>{if(!attempts++)throw Error('page.setContent: Target page, context or browser has been closed');return 'complete';},()=>{retries++;});
 assert.equal(value,'complete');assert.equal(attempts,2);assert.equal(retries,1);
 attempts=0;await assert.rejects(()=>recoverClosedBrowser(async()=>{attempts++;throw Error('Target page, context or browser has been closed');}),/closed/);assert.equal(attempts,2);
 attempts=0;await assert.rejects(()=>recoverClosedBrowser(async()=>{attempts++;throw Error('PDF_OVERFLOW');}),/PDF_OVERFLOW/);assert.equal(attempts,1);
});
