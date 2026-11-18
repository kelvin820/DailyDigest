import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {z} from 'zod';
import {GoogleProvider,listGoogleModels,generateGoogleImage} from '../lib/providers/google';
import {Budget} from '../lib/pipeline/state.mjs';

test('Google text uses the Google endpoint, low thinking, bounded output, and accounted usage',async t=>{
  t.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    const body=JSON.parse(String(options.body));
    assert.equal(body.reasoning_effort,'low');assert.equal(body.max_tokens,1124);
    assert.equal(body.chat_template_kwargs,undefined);
    return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}],
      usage:{prompt_tokens:12,completion_tokens:15}}));
  });
  const budget=new Budget({maxCalls:2,inputRate:undefined,outputRate:undefined});
  const result=await new GoogleProvider('not-a-real-key',budget).generateStructured({task:'write',system:'Test',
    data:{},schema:z.object({ok:z.boolean()}),model:'gemini-3.8-flash',timeoutMs:1000,maxOutputTokens:100});
  assert.deepEqual(result.data,{ok:true});assert.equal(budget.calls,1);
  assert.deepEqual(result.usage,{input_tokens:12,output_tokens:15});
});

test('Google catalog follows bounded pagination without putting the key in URLs',async()=>{
  let calls=0;
  const models=await listGoogleModels('not-a-real-key',async(url,options)=>{
    assert.doesNotMatch(String(url),/not-a-real-key/);
    assert.equal((options?.headers as Record<string,string>)['x-goog-api-key'],'not-a-real-key');
    calls++;return new Response(JSON.stringify(calls===1?{models:[{name:'models/gemini-3.8-flash'}],nextPageToken:'next'}:
      {models:[{name:'models/gemini-nano-banana-2.1'}]}));
  });
  assert.deepEqual(models,['gemini-3.8-flash','gemini-nano-banana-2.1']);assert.equal(calls,2);
});

test('Nano Banana Interactions and legacy native image shapes decode one raster without retries',async()=>{
  const bytes=await sharp({create:{width:256,height:256,channels:3,background:'#abc'}}).png().toBuffer();
  for(const model of ['gemini-nano-banana-2.1','gemini-3.1-flash-image'] as const){
    let calls=0;
    const result=await generateGoogleImage('not-a-real-key',model,'A park painting',async(url,options)=>{
      calls++;assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/v1beta/'));
      assert.doesNotMatch(String(url),/not-a-real-key/);
      const modern=model==='gemini-nano-banana-2.1';
      if(modern){assert.equal(JSON.parse(String(options?.body)).model,model);
        assert.equal((options?.headers as Record<string,string>)['Api-Revision'],'2026-05-20');}
      return new Response(JSON.stringify(modern?{steps:[{type:'model_output',content:[{type:'image',mime_type:'image/png',data:bytes.toString('base64')}]}],
        usage:{total_input_tokens:10,total_output_tokens:20}}:
        {candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:bytes.toString('base64')}}]}}],
          usageMetadata:{promptTokenCount:10,candidatesTokenCount:20}}));
    });
    assert.equal(calls,1);assert.equal(result.mime,'image/png');assert.deepEqual(result.bytes,bytes);
    assert.deepEqual(result.usage,{inputTokens:10,outputTokens:20});
  }
  await assert.rejects(generateGoogleImage('not-a-real-key','gemini-nano-banana-2.1','Test',async()=>
    new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED',message:'not-a-real-key'}}),{status:429})),
    /^Error: GOOGLE_HTTP_429_RESOURCE_EXHAUSTED$/);
  await assert.rejects(generateGoogleImage('not-a-real-key','gemini-nano-banana-2.1','Test',async()=>
    new Response(JSON.stringify({outputs:[{type:'text',text:'No image'}]}))),/GOOGLE_IMAGE_NOT_RETURNED/);
});
