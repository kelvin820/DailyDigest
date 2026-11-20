import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorToken,validEditorToken,equalSecret,editorOrigin} from '../lib/editorial/web-auth';

test('editor sessions expire and reject changed signatures, changed keys and distant expiration dates',()=>{
 const key='synthetic-long-editor-password-for-tests',now=Date.now(),token=editorToken(key,now+10000);
 assert.equal(validEditorToken(token,key,now),true);
 assert.equal(validEditorToken(token,key,now+10001),false);
 assert.equal(validEditorToken(token,key+'x',now),false);
 assert.equal(validEditorToken(token.slice(0,-1)+(token.endsWith('0')?'1':'0'),key,now),false);
 assert.equal(validEditorToken(editorToken(key,now+24*3600000),key,now),false);
 assert.equal(validEditorToken(undefined,key),false);
 assert.equal(equalSecret(key,key),true);assert.equal(equalSecret(key,'short'),false);
});
test('editor writes reject absent and cross-site origins',()=>{
 assert.doesNotThrow(()=>editorOrigin(new Request('https://example.com/api/editorial/jobs',{headers:{origin:'https://example.com'}})));
 assert.throws(()=>editorOrigin(new Request('https://example.com/api/editorial/jobs')),/FORBIDDEN/);
 assert.throws(()=>editorOrigin(new Request('https://example.com/api/editorial/jobs',{headers:{origin:'https://attacker.example'}})),/FORBIDDEN/);
 assert.doesNotThrow(()=>editorOrigin(new Request('http://localhost:3000/api/editorial/jobs',{headers:{origin:'https://example.com',host:'example.com'}})));
});
