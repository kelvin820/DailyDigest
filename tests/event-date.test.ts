import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedEventDate,verifiedNewsDates} from '../lib/editorial/event-date';
import {demoIssue} from '../fixtures/issue';
import type {WebFact} from '../lib/editorial/web-types';
test('full event dates require original evidence, including their year',()=>{
 assert.equal(verifiedEventDate('2024-11-17','The shower peaks on 17–18 November.'),null);
 assert.equal(verifiedEventDate('2025-12-10','It will be auctioned on 10 December.'),null);
 assert.equal(verifiedEventDate('2026-10-19','The meeting was held October 19–30, 2026.'),'2026-10-19');
 assert.equal(verifiedEventDate('2026-11-17','On 17 November 2026, it opened.'),'2026-11-17');
 assert.equal(verifiedEventDate('2026-11-17','It opened 2026-11-17.'),'2026-11-17');
 assert.equal(verifiedEventDate('2026-11-17','It opened November 18, 2026.'),null);
});
test('publication removes unsupported metadata without rewriting reviewed body, and blocks an invented year in text',()=>{
 const issue=demoIssue('junior'),article={...issue.articles[0],storyId:'news-one',headline:'Meteor Shower Peaks This Weekend',eventDate:'2024-11-17',bodyParagraphs:['The meteor shower peaks on November 17.']};issue.articles=[article];
 const fact={story_id:'news-one',event_date:'2024-11-17',sources:[{evidence:'The shower peaks on 17–18 November.'}]} as WebFact;
 const corrected=verifiedNewsDates([issue],[fact]);assert.equal(corrected[0].articles[0].eventDate,null);assert.equal(corrected[0].articles[0].headline,'Meteor Shower Peaks');assert.deepEqual(corrected[0].articles[0].bodyParagraphs,article.bodyParagraphs);assert.equal(article.eventDate,'2024-11-17');
 issue.articles[0]={...article,bodyParagraphs:['The shower peaks in 2024.']};assert.throws(()=>verifiedNewsDates([issue],[fact]),/UNVERIFIED_EVENT_YEAR/);
});
