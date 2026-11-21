import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedNewsImagePrompt} from '../lib/media/audience';
import {compactIllustrationSheetPrompt} from '../lib/media/illustration-sheet';
test('800-character image prompts retain age styles and complete claims, without cutting facts',()=>{
 const claims=['Microsoft restored services after a global outage that affected businesses and public services worldwide.','The outage disrupted services in more than 70 countries and territories.'];
 for(const edition of ['elementary','junior','senior'] as const){const r=boundedNewsImagePrompt(claims,'technology',edition);assert.ok(r.prompt.length<=800);assert.ok(r.prompt.includes(claims[0]));assert.ok(r.prompt.includes(claims[1]));assert.match(r.prompt,/watercolor/);assert.equal(r.topic,false);
 const huge=boundedNewsImagePrompt(['A'.repeat(500)],'technology',edition);assert.ok(huge.prompt.length<=800);assert.equal(huge.topic,true);}
 const sheet=compactIllustrationSheetPrompt('Students look through a telescope at an eclipse.');assert.ok(sheet.length<=800);assert.match(sheet,/pure black ink on white/);assert.throws(()=>compactIllustrationSheetPrompt('A'.repeat(800)),/SUBJECT_TOO_LONG/);
});
