import test from 'node:test';
import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withPdfProfile} from '../lib/pdf/temporary-profile';
test('PDF profiles are isolated and removed after success and browser failure',async()=>{
 let first='',second='';
 await withPdfProfile(async path=>{first=path;await writeFile(join(path,'cache'),'test');await withPdfProfile(async other=>{second=other;assert.notEqual(path,other);});await assert.rejects(access(second));await access(first);});
 await assert.rejects(access(first));
 await assert.rejects(()=>withPdfProfile(async path=>{first=path;await writeFile(join(path,'crash'),'test');throw Error('Target page has been closed');}),/Target page/);
 await assert.rejects(access(first));
});
