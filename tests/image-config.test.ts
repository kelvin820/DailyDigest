import test from 'node:test';
import assert from 'node:assert/strict';
import {imageModelPriority} from '../lib/providers/image-config';
test('image routing preserves explicit model order and rejects unsupported or duplicate priorities',()=>{
 const primary='black-forest-labs/flux.2-klein-4b';assert.deepEqual(imageModelPriority('',primary),[primary]);
 assert.deepEqual(imageModelPriority(primary+',stabilityai/stable-diffusion-3-medium,stabilityai/stable-diffusion-xl'),[primary,'stabilityai/stable-diffusion-3-medium','stabilityai/stable-diffusion-xl']);
 for(const config of ['unknown',primary+','+primary,primary+',',primary+',stabilityai/stable-diffusion-3-medium,stabilityai/stable-diffusion-xl,black-forest-labs/flux-3-image-klein'])assert.throws(()=>imageModelPriority(config),/PRIORITY_CONFIG/);
});
