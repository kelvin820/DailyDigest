import {publicationCatalog} from '../publications/catalog';
import plan from '../../config/benchmarks/2026-11-19-new-four.json';
import {factSchema} from '../schemas/editorial';
import type {EditorialCategory} from './requests';

const facts=plan.stories.map(s=>factSchema.parse({story_id:s.id,event_key:s.id+'-'+plan.issueDate,primary_category:s.category,content_kind:s.kind,published_at:s.sourceDate+'T00:00:00Z',published_at_precision:s.precision,event_date:s.eventDate,is_demo:false,sensitivity:'low',uncertainties:s.uncertainties,sources:[{source_id:'source-'+s.id,publisher:s.publisher,url:s.url,published_at:s.sourceDate+'T00:00:00Z',published_at_precision:s.precision,retrieved_at:plan.capturedAt,read_at:plan.capturedAt,rights_reviewed:true,independence_group:s.publisher,evidence:s.quotes.join('\n')}],claims:s.claims.map(([text,must_keep,status],i)=>({claim_id:'claim-'+(i+1),text,must_keep,status,supporting_source_ids:['source-'+s.id],evidence_ref:'source-'+s.id}))}));
// Topic tags are curated from the evidence. World news is not automatically politics.
export const sourceLibrary=[...new Map([...publicationCatalog.packets.flatMap(p=>p.facts),...facts].map(f=>[f.story_id,f])).values()].map(f=>({
 id:f.story_id,category:f.primary_category as EditorialCategory,fact:f,
 label:f.claims.find(c=>c.must_keep)!.text,publisher:f.sources[0].publisher,url:f.sources[0].url,
}));
export function sourceChoices(issueDate:string){
 const end=Date.parse(issueDate+'T23:59:59.999+08:00');
 return sourceLibrary.filter(s=>Date.parse(s.fact.published_at)<=end&&(s.fact.content_kind==='knowledge'||end-Date.parse(s.fact.published_at)<=7*86400000)).map(({id,category,label,publisher,url})=>({id,category,label,publisher,url}));
}
export type SourceChoice=ReturnType<typeof sourceChoices>[number];
