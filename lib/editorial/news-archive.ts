import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {safeFetch} from '../content/safe-fetch.mjs';
import {checkRobots,canonicalUrl} from '../content/sources.mjs';
import {newsSources,type NewsSettings,type NewsCandidate,type NewsCategory} from './news-config';
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export function articleDates(html:string){const $=load(html),meta=(name:string)=>$('meta').filter((_,e)=>$(e).attr('property')===name||$(e).attr('name')===name).first().attr('content');
 const iso=(s:string|undefined)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():undefined;
 return {publishedAt:iso(meta('article:published_time')||meta('datePublished')),modifiedAt:iso(meta('article:modified_time')||meta('dateModified'))};
}
export function parseGuardianArchive(html:string,date:string,sourceId:string,category:NewsCategory){
 const $=load(html),needle='/'+date.slice(0,4)+'/'+months[Number(date.slice(5,7))-1]+'/'+date.slice(8)+'/';
 const out:{url:string;title:string;excerpt:string;sourceId:string;category:NewsCategory}[]=[];
 $('.fc-item').each((_,e)=>{const card=$(e),a=card.find('.fc-item__title a').first(),link=a.attr('href');if(!link||!link.includes(needle)||/\/(live|video|audio|gallery)\//.test(link))return;
  try{out.push({url:canonicalUrl(link,['www.theguardian.com']),title:a.text().trim().slice(0,300),excerpt:card.find('.fc-item__standfirst').text().trim().slice(0,700),sourceId,category});}catch{/* An archive never expands the approved hosts. */}
 });return [...new Map(out.map(c=>[c.url,c])).values()];
}
export async function collectArchiveNews(settings:NewsSettings,date:string,fetcher=safeFetch,minSourceDate=date){
 const dayStart=Date.parse(date+'T00:00:00+08:00'),start=Math.max(dayStart-86400000,Date.parse(minSourceDate+'T00:00:00+08:00')),end=Date.parse(date+'T23:59:59.999+08:00');
 const previous=new Date(dayStart-86400000+8*3600000).toISOString().slice(0,10);
 const indexes:{url:string;sourceId:string;category:NewsCategory;date:string}[]=[];
 const sections:[string,string,NewsCategory][]=[['guardian-culture','culture','culture'],['guardian-culture','film','culture'],['guardian-culture','music','culture'],['guardian-culture','books','culture'],['guardian-culture','artanddesign','culture'],['guardian-life','lifeandstyle','culture'],['guardian-life','travel','culture'],['guardian-life','food','culture'],['guardian-tech','technology','technology'],['guardian-tech','games','technology'],['guardian-discovery','science','science'],['guardian-discovery','environment','nature'],['guardian-world','world','world']];
 for(const [sourceId,section,category] of sections.filter(([id,,c])=>settings.sourceIds.includes(id)&&settings.topicIds.includes(c))){
  for(const day of [date,previous])indexes.push({url:`https://www.theguardian.com/${section}/${day.slice(0,4)}/${months[Number(day.slice(5,7))-1]}/${day.slice(8)}/all`,sourceId,category,date:day});
 }
 const failures:{source:string;code:string}[]=[],robots=new Set<string>(),read=async(url:string,domains:string[])=>{const origin=new URL(url).origin;if(!robots.has(origin)){await checkRobots(url,domains,fetcher);robots.add(origin);}return fetcher(url,domains,{timeoutMs:15000,maxBytes:2_000_000});};
 const cards:ReturnType<typeof parseGuardianArchive>=[];
 // Bound archive requests independently of model work and never follow HTTP downgrades.
 for(let i=0;i<indexes.length;i+=3){const batch=indexes.slice(i,i+3);const result=await Promise.allSettled(batch.map(async s=>parseGuardianArchive((await read(s.url,['www.theguardian.com'])).text,s.date,s.sourceId,s.category)));result.forEach((r,j)=>{if(r.status==='fulfilled')cards.push(...r.value);else failures.push({source:batch[j].sourceId,code:'ARCHIVE_UNAVAILABLE'});});}
 const unique=[...new Map(cards.map(c=>[c.url,c])).values()],balanced:typeof cards=[];
 for(let n=0;n<12;n++)for(const [,section,category] of sections){const c=unique.filter(c=>c.category===category&&c.url.includes('/'+section+'/'))[n];if(c&&!balanced.some(b=>b.url===c.url))balanced.push(c);}
 const candidates:NewsCandidate[]=[];
 for(let i=0;i<Math.min(balanced.length,84)&&candidates.length<30;i+=3){const result=await Promise.allSettled(balanced.slice(i,i+3).map(async c=>{
  const r=await read(c.url,['www.theguardian.com']),dates=articleDates(r.text);if(!dates.publishedAt)throw Error('HISTORICAL_DATE_UNKNOWN');
  const at=Date.parse(dates.publishedAt);if(at<start||at>end||dates.modifiedAt&&Date.parse(dates.modifiedAt)>end)return null;
  return {id:digest(c.url),sourceId:c.sourceId,publisher:'The Guardian',title:c.title,url:c.url,publishedAt:dates.publishedAt,excerpt:c.excerpt,category:c.category,referenceDate:date};
 }));for(const r of result)if(r.status==='fulfilled'&&r.value)candidates.push(r.value);}
 if(settings.sourceIds.includes('global-voices')){
  const {parseNewsFeed}=await import('./news');const source=newsSources.find(s=>s.id==='global-voices')!;
  for(const day of [date,previous])try{const r=await read(`https://globalvoices.org/${day.replaceAll('-','/')}/feed/`,['globalvoices.org']);candidates.push(...parseNewsFeed(r.text,source,new Date(end)).filter(c=>Date.parse(c.publishedAt)>=start&&Date.parse(c.publishedAt)<=end).map(c=>({...c,referenceDate:date})));}catch{failures.push({source:'Global Voices',code:'ARCHIVE_UNAVAILABLE'});}
 }
 return {candidates:[...new Map(candidates.map(c=>[c.id,c])).values()],failures};
}
