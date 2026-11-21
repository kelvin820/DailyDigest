import {z} from 'zod';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';

export const newsTopics={world:'國際與人物',culture:'文化、歷史與生活',nature:'動物與環境',technology:'科技與遊戲',science:'科學與有趣發現',business:'商業與日常經濟'} as const;
export type NewsCategory=keyof typeof newsTopics;
// RSS is a discovery index. Article text is read transiently to extract facts;
// it is never mirrored, translated wholesale or stored as a full-text archive.
export const newsSources=[
 {id:'bbc-world',name:'BBC · 國際與生活',publisher:'BBC',feed:'https://feeds.bbci.co.uk/news/world/rss.xml',feedDomains:['feeds.bbci.co.uk'],domains:['www.bbc.com','www.bbc.co.uk','bbc.com','bbc.co.uk'],categories:['world','culture'],terms:'https://www.bbc.co.uk/usingthebbc/terms/',mode:'facts'},
 {id:'bbc-tech',name:'BBC · 科技',publisher:'BBC',feed:'https://feeds.bbci.co.uk/news/technology/rss.xml',feedDomains:['feeds.bbci.co.uk'],domains:['www.bbc.com','www.bbc.co.uk','bbc.com','bbc.co.uk'],categories:['technology'],terms:'https://www.bbc.co.uk/usingthebbc/terms/',mode:'facts'},
 {id:'guardian-life',name:'The Guardian · 文化與生活',publisher:'The Guardian',feed:'https://www.theguardian.com/lifeandstyle/rss',feedDomains:['www.theguardian.com'],domains:['www.theguardian.com'],categories:['culture','business'],terms:'https://www.theguardian.com/help/feeds',mode:'facts'},
 {id:'guardian-tech',name:'The Guardian · 科技與遊戲',publisher:'The Guardian',feed:'https://www.theguardian.com/technology/rss',feedDomains:['www.theguardian.com'],domains:['www.theguardian.com'],categories:['technology','business'],terms:'https://www.theguardian.com/help/feeds',mode:'facts'},
 {id:'guardian-world',name:'The Guardian · 國際與人物',publisher:'The Guardian',feed:'https://www.theguardian.com/world/rss',feedDomains:['www.theguardian.com'],domains:['www.theguardian.com'],categories:['world'],terms:'https://www.theguardian.com/help/feeds',mode:'facts'},
 {id:'guardian-culture',name:'The Guardian · 文化與藝術',publisher:'The Guardian',feed:'https://www.theguardian.com/culture/rss',feedDomains:['www.theguardian.com'],domains:['www.theguardian.com'],categories:['culture'],terms:'https://www.theguardian.com/help/feeds',mode:'facts'},
 {id:'guardian-discovery',name:'The Guardian · 科學與環境',publisher:'The Guardian',feed:'https://www.theguardian.com/science/rss',feedDomains:['www.theguardian.com'],domains:['www.theguardian.com'],categories:['science','nature'],terms:'https://www.theguardian.com/help/feeds',mode:'facts'},
 {id:'smithsonian',name:'Smithsonian · 有趣故事與發現',publisher:'Smithsonian Magazine',feed:'https://www.smithsonianmag.com/rss/smart-news/',feedDomains:['www.smithsonianmag.com'],domains:['www.smithsonianmag.com'],categories:['culture','nature','science'],terms:'https://www.smithsonianmag.com/rss/',mode:'facts'},
 {id:'global-voices',name:'Global Voices · 世界人物與文化',publisher:'Global Voices',feed:'https://globalvoices.org/feed/',feedDomains:['globalvoices.org'],domains:['globalvoices.org'],categories:['world','culture'],terms:'https://globalvoices.org/about/global-voices-attribution-policy/',mode:'cc-by'},
 {id:'nasa',name:'NASA · 太空（選用）',publisher:'NASA',feed:'https://www.nasa.gov/feed/',feedDomains:['www.nasa.gov'],domains:['www.nasa.gov','science.nasa.gov'],categories:['science'],terms:'https://www.nasa.gov/nasa-brand-center/images-and-media/',mode:'facts'},
] as const;
export type NewsSource=typeof newsSources[number];
export const newsSettingsSchema=z.object({sourceIds:z.array(z.string()).min(1).max(newsSources.length).refine(a=>new Set(a).size===a.length&&a.every(id=>newsSources.some(s=>s.id===id))),topicIds:z.array(z.enum(['world','culture','nature','technology','science','business'])).min(1).max(6).refine(a=>new Set(a).size===a.length),autoEnabled:z.boolean(),publishTime:z.string().regex(/^(0[2-9]|1\d|2[0-3]):[0-5]\d$/),selectionTime:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),direction:z.string().trim().max(1200)}).strict().refine(s=>!s.selectionTime||s.selectionTime<s.publishTime,{message:'Selection must precede publication',path:['selectionTime']});
export type NewsSettings=z.infer<typeof newsSettingsSchema>;
export const defaultNewsSettings:NewsSettings={sourceIds:newsSources.filter(s=>s.id!=='nasa').map(s=>s.id),topicIds:Object.keys(newsTopics) as NewsCategory[],autoEnabled:true,selectionTime:'09:00',publishTime:'12:00',direction:'優先選具體、有驚喜、與生活有關的新聞、有趣故事與新發現；避免整期都是機構公告。'};
export const newsSettingsKey=WEB_PREFIX+'news:settings';
export async function getNewsSettings(store:DocumentStore){const row=await store.get<{version:number;settings:NewsSettings}>(newsSettingsKey);return row?newsSettingsSchema.parse(row.settings):structuredClone(defaultNewsSettings);}
export async function saveNewsSettings(store:DocumentStore,raw:unknown){const settings=newsSettingsSchema.parse(raw);await changeDocument(store,newsSettingsKey,()=>({version:0,settings}),v=>{v.settings=settings;});return settings;}
export type NewsCandidate={id:string;sourceId:string;publisher:string;title:string;url:string;publishedAt:string;excerpt:string;category:NewsCategory;titleZh?:string;summaryZh?:string;whyZh?:string;eventKey?:string;score?:number;referenceDate?:string};
export type NewsRound={version:number;id:string;issueDate:string;createdAt:string;settings:NewsSettings;status:'collecting'|'ready'|'failed';candidates:NewsCandidate[];recommendedIds:string[];failures:{source:string;code:string}[];usage:{calls:number;inputTokens:number;outputTokens:number};error?:string;invalidReplies?:import('../providers/text').InvalidStructuredReply[]};
export type NewsPlan={version:number;issueDate:string;roundId:string|null;selectedIds:string[];jobId:string|null;selectedBy:'manual'|'llm'|null;updatedAt:string;runId?:string;workflowAttempt?:number;error?:string|null;lockedAt?:string|null};
export const newsRoundKey=(id:string)=>WEB_PREFIX+'news:round:'+z.uuid().parse(id);
export const newsPlanKey=(date:string)=>WEB_PREFIX+'news:plan:'+z.iso.date().parse(date);
export const emptyNewsPlan=(date:string):NewsPlan=>({version:0,issueDate:date,roundId:null,selectedIds:[],jobId:null,selectedBy:null,updatedAt:new Date().toISOString()});
export function scheduleTimes(date:string,time:string,selectionTime?:string){const publish=new Date(date+'T'+time+':00+08:00'),prepare=selectionTime?new Date(date+'T'+selectionTime+':00+08:00'):new Date(publish.valueOf()-3*3600000);if(prepare>=publish)throw Error('INVALID_SCHEDULE');return {publishAt:publish.toISOString(),prepareAt:prepare.toISOString()};}
