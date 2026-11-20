import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
for(const route of ['jobs/[id]','jobs/[id]/publish','setup']){
 const path=resolve('.next/server/app/api/editorial',route,'route.js.nft.json');
 const trace=JSON.parse(await readFile(path,'utf8')).files;
 for(const required of ['playwright-core/browsers.json','playwright-core/lib/coreBundle.js','chromium/bin/chromium.br','chromium/bin/al2023.tar.br','public/fonts/NotoSansTC-Print.ttf','app/globals.css']){
  const file=trace.find(f=>f.replaceAll('\\','/').endsWith(required));assert.ok(file,route+' missing '+required);await readFile(resolve(dirname(path),file));
 }
 const metadata=trace.find(f=>f.replaceAll('\\','/').endsWith('playwright-core/browsers.json'));
 assert.ok(JSON.parse(await readFile(resolve(dirname(path),metadata),'utf8')).browsers.some(b=>b.name==='chromium'));
 assert.ok(!trace.some(f=>/(?:^|[\/\\])\.env(?:\.|$)/.test(f)),route+' traced an environment file');
}
console.log('PASS: PDF runtime traces include browser metadata, engine binaries, stylesheet and fonts; no environment files.');
