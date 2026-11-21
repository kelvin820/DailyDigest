import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {cropIllustrationSheet,illustrationSheetPrompt} from '../lib/media/illustration-sheet';
test('one sheet yields four independent full-width panels; adult study is true monochrome',async()=>{
 const shapes=['#d99b44','#598bb9','#54785f','#ffffff'].map((fill,i)=>'<rect y="'+i*256+'" width="1024" height="256" fill="'+fill+'"/><circle cx="'+(100+i*160)+'" cy="'+(128+i*256)+'" r="60" fill="#111"/>').join('');
 const bytes=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">'+shapes+'</svg>')).png().toBuffer(),panels=await cropIllustrationSheet(bytes);
 assert.deepEqual(panels.map(p=>p.key),['elementary','junior','senior','adult_study']);assert.ok(panels.every(p=>p.width===1024&&p.height===252));assert.equal(new Set(panels.map(p=>p.sha256)).size,4);
 const adult=await sharp(panels[3].bytes).removeAlpha().raw().toBuffer();assert.ok(adult.every(v=>v===0||v===255));
 await assert.rejects(()=>cropIllustrationSheet(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>')),/GEOMETRY/);
 assert.match(illustrationSheetPrompt('a telescope under meteors'),/FOUR equal-height HORIZONTAL/);
});
