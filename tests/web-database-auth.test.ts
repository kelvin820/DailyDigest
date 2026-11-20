import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceFetch,isServiceKey,databaseConfiguration} from '../lib/editorial/web-store';

test('Marketplace credentials form a consistent pair and take precedence over the old manually configured database',()=>{
 const old={NEXT_PUBLIC_SUPABASE_URL:'https://old.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'legacy-key'};
 assert.deepEqual(databaseConfiguration(old),{url:old.NEXT_PUBLIC_SUPABASE_URL,key:'legacy-key',source:'legacy'});
 assert.deepEqual(databaseConfiguration({...old,SUPABASE_URL:'https://new.supabase.co',SUPABASE_SECRET_KEY:' sb_secret_new '}),{url:'https://new.supabase.co',key:'sb_secret_new',source:'marketplace'});
 assert.deepEqual(databaseConfiguration({...old,SUPABASE_SECRET_KEY:'sb_secret_new'}),{url:undefined,key:'sb_secret_new',source:'marketplace'});
});

test('the server rejects anon and publishable keys before using elevated database operations',()=>{
 const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.synthetic';
 assert.equal(isServiceKey(jwt('service_role')),true);assert.equal(isServiceKey(jwt('anon')),false);assert.equal(isServiceKey('sb_publishable_synthetic'),false);assert.equal(isServiceKey('sb_secret_synthetic'),true);assert.equal(isServiceKey('bad'),false);
});

test('opaque server API keys are sent only in apikey, while legacy JWT and actual session auth remain intact',async()=>{
 const seen:Headers[]=[];
 const fetcher:typeof fetch=async(_input,init)=>{seen.push(new Headers(init?.headers));return Response.json([]);};
 await serviceFetch('sb_secret_synthetic',fetcher)('https://example.supabase.co/rest/v1/app_settings',{headers:{apikey:'sb_secret_synthetic',Authorization:'Bearer sb_secret_synthetic'}});
 assert.equal(seen[0].get('apikey'),'sb_secret_synthetic');assert.equal(seen[0].has('authorization'),false);
 await serviceFetch('legacy-jwt',fetcher)('https://example.supabase.co/rest/v1/app_settings',{headers:{apikey:'legacy-jwt',Authorization:'Bearer legacy-jwt'}});
 assert.equal(seen[1].get('authorization'),'Bearer legacy-jwt');
 await serviceFetch('sb_secret_synthetic',fetcher)('https://example.supabase.co/rest/v1/app_settings',{headers:{apikey:'sb_secret_synthetic',Authorization:'Bearer distinct-session-jwt'}});
 assert.equal(seen[2].get('authorization'),'Bearer distinct-session-jwt');
});
