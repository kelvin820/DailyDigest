import test from 'node:test';
import assert from 'node:assert/strict';
import {glossaryRepairSchema} from '../lib/pipeline/glossary-repair';
import {recoverStructuredReply} from '../lib/pipeline/recover-structured';
import {hash} from '../lib/pipeline/state.mjs';
import type {GenerationRequest} from '../lib/providers/text';
const entry=(term:string)=>({term,definitionEn:'A useful learning term.',meaningZhHant:'測試詞義'});
test('a glossary accepts exact phrases while rejecting absent, repeated and reused terms',()=>{
 const schema=glossaryRepairSchema('Students explore artificial intelligence and build robots.',['students']);
 assert.ok(schema.safeParse({vocabulary:[entry('artificial intelligence'),entry('robots')]}).success);
 for(const terms of [['AI','robots'],['students','robots'],['robots','Robots']])assert.equal(schema.safeParse({vocabulary:terms.map(entry)}).success,false);
});
test('only intact matching paid responses can be recovered, with no new model usage',()=>{
 const schema=glossaryRepairSchema('Students explore artificial intelligence and build robots.',[]),request:GenerationRequest<unknown>={task:'revise',model:'fixture',system:'same',data:{},schema,timeoutMs:1000,maxOutputTokens:700};
 const raw={task:'revise',model:'fixture',attempt:1,content:JSON.stringify({vocabulary:[entry('artificial intelligence'),entry('robots')]}),validation:[]},checkpoint={status:'success',inputHash:hash({task:raw.task,model:raw.model}),output:raw,outputHash:hash(raw)};
 assert.deepEqual(recoverStructuredReply({'invalid:key:1':checkpoint},'key',request)?.usage,{input_tokens:0,output_tokens:0});
 assert.equal(recoverStructuredReply({'invalid:key:1':{...checkpoint,outputHash:'changed'}},'key',request),undefined);
 assert.equal(recoverStructuredReply({'invalid:other:1':checkpoint},'key',request),undefined);
 assert.equal(recoverStructuredReply({'invalid:key:1':checkpoint},'key',{...request,model:'different'}),undefined);
});
