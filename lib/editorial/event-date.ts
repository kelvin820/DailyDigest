import type {EditionView} from '../schemas/edition';
import type {WebFact,WebJob} from './web-types';

export function verifiedEventDate(date:string|null,evidence:string){
 if(!date)return null;
 const [year,month,day]=date.split('-'),n=Number(day),names=['January','February','March','April','May','June','July','August','September','October','November','December'],name=names[Number(month)-1];
 if(!name)return null;
 const text=evidence.normalize('NFKC').replace(/[–—]/g,'-');
 const mon='(?:'+name+'|'+name.slice(0,3)+'\\.?)',d=String(n)+'(?:st|nd|rd|th)?',range='(?:\\s*-\\s*\\d{1,2}(?:st|nd|rd|th)?)?';
 return [date,mon+'\\s+'+d+range+',?\\s+'+year,d+range+'\\s+'+mon+',?\\s+'+year].some(p=>new RegExp('\\b'+p+'\\b','i').test(text))?date:null;
}

export function verifiedNewsDates(editions:EditionView[],facts:WebFact[]){
 return editions.map(e=>({...e,articles:e.articles.map(article=>{
  const fact=facts.find(f=>f.story_id===article.storyId);if(!fact||!fact.story_id.startsWith('news-'))return article;
  const evidence=fact.sources.map(s=>s.evidence).join('\n'),eventDate=verifiedEventDate(fact.event_date,evidence);
  if(!eventDate&&fact.event_date){const year=fact.event_date.slice(0,4),pattern=new RegExp('\\b'+year+'\\b');
   if(pattern.test(article.headline+' '+article.bodyParagraphs.join(' '))&&!pattern.test(evidence))throw Error('UNVERIFIED_EVENT_YEAR');
  }
  // Relative weekends can be guessed from a model's training-year calendar.
  // A deletion-only headline correction keeps the source-supported event.
  const headline=/\b(?:this|next|last) weekend\b/i.test(evidence)?article.headline:article.headline.replace(/\s+(?:this|next|last) weekend[.!]?$/i,'').trim();
  return {...article,headline,eventDate};
 })}));
}
export const publicationEditions=(job:WebJob,releasedAt:string)=>verifiedNewsDates(job.editions,job.facts).map(e=>({...e,reviewCopy:false,publishedAt:releasedAt}));
