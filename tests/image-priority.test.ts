import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWithImagePriority,ImagePriorityError} from '../lib/media/image-priority';
test('image priority tries the next configured model and retains the exact failure reason',async()=>{
 const calls:string[]=[],failures:unknown[]=[];
 const r=await generateWithImagePriority([{id:'first',run:async()=>{calls.push('first');throw Error('IMAGE_CONTENT_FILTERED');}},{id:'second',run:async()=>{calls.push('second');return 'pixels';}},{id:'third',run:async()=>{calls.push('third');return 'unused';}}],f=>{failures.push(f);});
 assert.deepEqual(calls,['first','second']);assert.equal(r.result,'pixels');assert.equal(r.model,'second');assert.deepEqual(failures,[{model:'first',code:'IMAGE_CONTENT_FILTERED'}]);
 await assert.rejects(()=>generateWithImagePriority([{id:'bad-key',run:async()=>{throw Error('IMAGE_HTTP_401');}},{id:'unused',run:async()=>{throw Error('SHOULD_NOT_CALL');}}]),e=>e instanceof ImagePriorityError&&e.failures.length===1);
});
