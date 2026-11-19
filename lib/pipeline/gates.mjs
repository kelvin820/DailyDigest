import {vocabularyOverlapErrors} from '../content/vocabulary.mjs';
import {storyCountOf,supportedStoryCounts} from '../../config/issue-settings.mjs';
import { validateIssue } from '../content/core.mjs';
import { hash } from './state.mjs';
export function publishGate({ editions = [], facts = [], reviews = [], files = [], live = true, verifiedImageAssetIds = [] }) {
  const errors = [];
  const required = ['elementary', 'junior', 'senior'];
  if (editions.length !== 3 || !required.every(key => editions.filter(e => e.edition === key).length === 1)) {
    errors.push('Three editions required');
  }
  const count=editions[0]?storyCountOf(editions[0]):4;
  if(!supportedStoryCounts.includes(count)||facts.length!==count||new Set(facts.map(f=>f.story_id)).size!==count||new Set(facts.map(f=>f.event_key)).size!==count)errors.push('Distinct verified event count mismatch');
  if (reviews.length !== count*3 || new Set(reviews.map(r => r.storyId + ':' + r.edition)).size !== count*3) {
    errors.push('Complete review records required');
  }
  if (files.length !== 6 || new Set(files.map(f => f.edition + ':' + f.mode)).size !== 6) errors.push('Six distinct PDF files required');
  if(editions.some(e=>e.vocabularyPolicy==='tiered-v1'))errors.push(...vocabularyOverlapErrors(editions));
  const base = editions[0];
  const issueEnd=base?Date.parse(base.issueDate+'T23:59:59.999+08:00'):NaN;
  if(!Number.isFinite(issueEnd))errors.push('Invalid issue date');
  const oldest=Math.min(Date.now(),issueEnd)-7*86400_000;
  for(const fact of facts){
    const published=Date.parse(fact.published_at);
    if(!Number.isFinite(published)||published>issueEnd||(fact.content_kind!=='knowledge'&&published<oldest)||
      fact.sources?.some(source=>!Number.isFinite(Date.parse(source.published_at))||Date.parse(source.published_at)>issueEnd)){
      errors.push('Source publication outside issue window');
    }
  }
  for (const e of editions) {
    errors.push(...validateIssue(e));
    if (live && e.isDemo) errors.push('DEMO cannot publish live');
    if (e.issueDate !== base.issueDate || e.revision !== base.revision ||
      JSON.stringify(e.articles.map(a => a.storyId)) !== JSON.stringify(base.articles.map(a => a.storyId))) errors.push('Edition mismatch');
    for (const a of e.articles) {
      const f = facts.find(f => f.story_id === a.storyId);
      if (!f || !f.claims?.length || !f.sources?.length) errors.push('Missing evidence');
      else {
        if (live && (f.is_demo || f.sources.some(s => !s.read_at || !s.rights_reviewed))) errors.push('Unverified source');
        if (a.category !== f.primary_category || a.contentKind !== f.content_kind) errors.push('Fact metadata mismatch');
        if (a.sources.some(s => !f.sources.some(source => source.url === s.url))) errors.push('Unverified source URL');
      }
      const r = reviews.find(r => r.storyId === a.storyId && r.edition === e.edition);
      if (!r || r.factual_status !== 'pass' || r.level_fit !== 'suitable' ||
        r.issues.some(i => ['critical', 'major'].includes(i.severity)) || !['pass','human_review'].includes(r.publish_recommendation)) errors.push('Review not passed');
      if (!a.image.credit || !a.image.assetId) errors.push('Image not credited');
      // Default remains closed. The file-backed publisher supplies IDs only after verifying bundled file hashes and rights.
      if (a.image.kind !== 'icon' && !verifiedImageAssetIds.includes(a.image.assetId)) errors.push('Image transport not verified');
    }
    const categories = ['world', 'business', 'technology', 'culture', 'nature', 'science'];
    if ((count===8&&categories.some(category=>{const n=e.articles.filter(a=>a.category===category).length;return n<1||n>2;}))||
      (count===4&&(new Set(e.articles.map(a=>a.category)).size<3||categories.some(category=>e.articles.filter(a=>a.category===category).length>2))))errors.push('Category quota needs an approved editorial exception');
    if (e.articles.filter(a => a.contentKind === 'knowledge').length > 2) errors.push('At most two knowledge stories');
    for (const mode of ['color', 'ink']) {
      const f = files.find(f => f.edition === e.edition && f.mode === mode);
      if (!f || f.pages !== 2 || !f.noOverflow || !f.textVerified || !f.fontsEmbedded ||
        f.revision !== e.revision || f.templateVersion !== e.templateVersion || f.issueDate !== e.issueDate ||
        f.contentHash !== hash(e)) errors.push('PDF validation incomplete or stale');
    }
  }
  return { pass: errors.length === 0, mode: live ? 'live' : 'demo',
    needs_human: facts.some(f => f.sensitivity !== 'low') || reviews.some(r => r.suitability !== 'pass' || r.publish_recommendation === 'human_review'),
    errors: [...new Set(errors)] };
}

