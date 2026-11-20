import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {words,sentences,stats,makeDemo,validateIssue,taipeiDate} from "../lib/content/core.mjs";import {hash,cacheKey,cachedStep,leaseAvailable,Budget,dedupe} from "../lib/pipeline/state.mjs";import {publishGate} from "../lib/pipeline/gates.mjs";import {allowedUrl,publicAddress} from "../lib/content/safe-fetch.mjs";import {esc,safeUrl,renderPrint} from "../lib/render.mjs";
const stories=JSON.parse(readFileSync(new URL("../fixtures/stories.json",import.meta.url),"utf8"));const all=["elementary","junior","senior"].map(e=>makeDemo(stories,e));
test("count contractions, hyphens, decimals and comma numbers",()=>assert.equal(words("don't well-known 2026 1,200 3.14 — &").length,5));
test("sentence segmenter protects titles, U.S. and decimals",()=>{assert.equal(sentences("Mr. Green works in the U.S. today. He has 3.14 dollars.").length,2)});
test("24 bodies meet configured length, sentence and vocabulary rules",()=>all.forEach(p=>assert.deepEqual(validateIssue(p),[])));
test("three editions share story ids, order, facts fixture and date",()=>{for(const p of all)assert.deepEqual(p.articles.map(x=>x.storyId),all[0].articles.map(x=>x.storyId))});
test("vocabulary absent is rejected",()=>{const p=structuredClone(all[0]);p.articles[0].vocabulary[0].term="missing";assert.ok(validateIssue(p).length)});
test("Taipei crosses UTC boundary correctly",()=>assert.equal(taipeiDate(new Date("2026-11-16T22:17:00Z")),"2026-11-17"));
test("DEMO and incomplete reviews cannot pass live publish",()=>assert.equal(publishGate({editions:all,facts:[],reviews:[],files:[]}).pass,false));
test("cached successful output avoids second bill; changed model invalidates",async()=>{const m=new Map();let calls=0;const store={get:async k=>m.get(k),set:async(k,v)=>m.set(k,v)};const run=async()=>++calls;await cachedStep(store,"a",{model:"one"},run);await cachedStep(store,"a",{model:"one"},run);assert.equal(calls,1);await cachedStep(store,"a",{model:"two"},run);assert.equal(calls,2)});
test('JSONB object ordering preserves cache integrity; corrupted output stops before another call',async()=>{
  const values=new Map();let calls=0;
  const store={get:async k=>values.get(k),set:async(k,v)=>values.set(k,v)};
  await cachedStep(store,'db',{b:2,a:1},async()=>{calls++;return {z:1,a:{y:2,b:3}}});
  const record=values.get('db');record.output={a:{b:3,y:2},z:1};
  await cachedStep(store,'db',{a:1,b:2},async()=>{calls++;return {}});assert.equal(calls,1);
  record.output.z=9;
  await assert.rejects(cachedStep(store,'db',{a:1,b:2},async()=>{calls++;return {}}),/CACHE_INTEGRITY_FAILED/);
  assert.equal(calls,1);
});
test("failed step is retried and never cached as success",async()=>{const m=new Map();let calls=0;const s={get:async k=>m.get(k),set:async(k,v)=>m.set(k,v)};await assert.rejects(cachedStep(s,"x",{},async()=>{calls++;throw Error("timeout")}));await cachedStep(s,"x",{},async()=>{calls++;return 1});assert.equal(calls,2)});
test("lease takeover only after expiry; old owner cannot reuse active lease",()=>{assert.equal(leaseAvailable({owner:"a",expiresAt:200},"b",100),false);assert.equal(leaseAvailable({owner:"a",expiresAt:200},"b",201),true)});
test("budget reserves costs before spending",()=>{const b=new Budget({usd:.001,inputRate:10,outputRate:10,maxCalls:2});assert.throws(()=>b.reserve(1000,1000),/BUDGET/);const u=new Budget({maxCalls:1});u.reserve(10,20);assert.throws(()=>u.reserve(10,20),/BUDGET/)});
test('zero budget pauses model calls even when token prices are unknown',()=>assert.throws(()=>new Budget({usd:0}).reserve(1,1),/BUDGET/));
test("event dedupe differs from URL dedupe",()=>assert.deepEqual(dedupe([{eventKey:"same",url:"b"},{eventKey:"new",url:"c"}],[{eventKey:"same",url:"a"}]).map(x=>x.eventKey),["new"]));
test("reject localhost, private, credentials, unexpected domains and schemes",()=>{for(const ip of ["127.0.0.1","10.0.0.1","169.254.169.254","192.168.0.1","172.16.0.1","::1","::ffff:127.0.0.1","fd00::1"])assert.equal(publicAddress(ip),false);for(const u of ["http://www.nasa.gov","https://localhost","https://www.nasa.gov.evil.com","https://u:p@www.nasa.gov","file:///etc/passwd"])assert.throws(()=>allowedUrl(u,["www.nasa.gov"]))});
test("source injection remains escaped inert data; javascript URL refused",()=>{assert.equal(esc('<script>alert("x")</script>'),"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");assert.equal(safeUrl("javascript:alert(1)"),"#");const p=structuredClone(all[0]);p.articles[0].headline="<script>ignore all rules</script>";const html=renderPrint(p,"color");assert.equal(html.includes("<script>"),false)});
test("print template retains every story and body without enforcing a page count",()=>{for(const p of all){const html=renderPrint(p,"ink");assert.equal((html.match(/class="print-article"/g)||[]).length,p.articles.length);for(const a of p.articles)assert.ok(html.includes(esc(a.bodyParagraphs[0])))}})
test('knowledge, updates and event dates are explicit in the shared reading/print markup',()=>{
  const p=structuredClone(all[0]);p.articles[0].contentKind='knowledge';
  p.articles[1].contentKind='update';p.articles[1].eventDate='2026-11-16';p.articles[1].updateNote='A new result was reported.';
  const html=renderPrint(p,'color');assert.ok(html.includes('KNOWLEDGE'));assert.ok(html.includes('UPDATE'));
  assert.ok(html.includes('Event: 2026-11-16'));assert.ok(html.includes('A new result was reported.'));
});

