import test from 'node:test';
import assert from 'node:assert/strict';
import {promptExecutionHash,resolvePromptSnapshot} from '../lib/editorial/prompt-snapshot';
test('cross-platform prompt recovery preserves exact checkpoint input bytes',()=>{
 const original={writer:'Write.\r\nFacts only.\r\n',reviewer:'Review.\nVerify.\n'},current={writer:original.writer.replaceAll('\r\n','\n'),reviewer:original.reviewer.replaceAll('\n','\r\n')};
 assert.deepEqual(resolvePromptSnapshot(promptExecutionHash(original),current),original);
 const changed={...current,writer:'Different instructions'};
 assert.throws(()=>resolvePromptSnapshot(promptExecutionHash(original),changed),/GENERATION_PROMPTS_CHANGED/);
 assert.deepEqual(resolvePromptSnapshot(promptExecutionHash(original),changed,original),original);
 assert.throws(()=>resolvePromptSnapshot('changed-config',current,original),/GENERATION_PROMPTS_CHANGED/);
});
