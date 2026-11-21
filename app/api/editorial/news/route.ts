import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {json} from '../../../../lib/api';
import {taipeiDate} from '../../../../lib/content/metrics';
import {requireEditor,editorOrigin,validSetupAuthorization} from '../../../../lib/editorial/web-auth';
import {documentStore,changeDocument} from '../../../../lib/editorial/web-store';
import {webError,requestBody} from '../../../../lib/editorial/web-api';
import {newsSources,newsTopics,newsSettingsSchema,getNewsSettings,saveNewsSettings,newsPlanKey,newsRoundKey,emptyNewsPlan,type NewsPlan,type NewsRound} from '../../../../lib/editorial/news-config';
import {refreshNewsRound,selectNews} from '../../../../lib/editorial/news';
import {createWebJob,jobKey,releaseKey} from '../../../../lib/editorial/web-jobs';
import type {WebJob,WebRelease} from '../../../../lib/editorial/web-types';
import {startEdition,startDaily} from '../../../../lib/editorial/background';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect'),issueDate:z.iso.date()}).strict(),
 z.object({action:z.literal('settings'),settings:newsSettingsSchema}).strict(),
 z.object({action:z.literal('refresh'),issueDate:z.iso.date(),id:z.uuid()}).strict(),
 z.object({action:z.literal('select'),issueDate:z.iso.date(),roundId:z.uuid(),ids:z.array(z.string()).max(4),by:z.enum(['manual','llm']).default('manual')}).strict(),
 z.object({action:z.literal('generate'),issueDate:z.iso.date(),roundId:z.uuid(),ids:z.array(z.string()).length(4),direction:z.string().max(1200).default(''),id:z.uuid()}).strict(),
 z.object({action:z.literal('schedule'),issueDate:z.iso.date()}).strict(),
]);
async function state(date:string){
 const store=documentStore(),settings=await getNewsSettings(store),plan=await store.get<NewsPlan>(newsPlanKey(date)),round=plan?.roundId?await store.get<NewsRound>(newsRoundKey(plan.roundId)):null;
 const job=plan?.jobId?await store.get<WebJob>(jobKey(plan.jobId)):null,published=!!await store.get<WebRelease>(releaseKey(date));
 const progress=job?{id:job.id,status:job.status,error:job.error,facts:job.facts.length,articles:job.editions.reduce((n,e)=>n+e.articles.length,0),imagesDone:Object.values(job.imageStates??{}).filter(v=>v==='done').length,imagesFailed:Object.values(job.imageStates??{}).filter(v=>v==='failed').length,pdfs:job.pdfs.length,lastEvent:job.events.at(-1)?.message}:null;
 return {settings,plan,round,published,progress,sources:newsSources.map(({id,name,categories})=>({id,name,categories})),topics:newsTopics};
}
export async function GET(req:Request){try{await requireEditor();return json(await state(z.iso.date().parse(new URL(req.url).searchParams.get('date')||taipeiDate())));}catch(e){return webError(e);}}
export async function POST(req:Request){try{
 editorOrigin(req);if(!validSetupAuthorization(req.headers.get('authorization')))await requireEditor();
 const input=schema.parse(await requestBody(req)),store=documentStore();
 if(input.action==='inspect')return json(await state(input.issueDate));
 if(input.action==='settings')return json({settings:await saveNewsSettings(store,input.settings)});
 if(input.action==='refresh')return json({round:await refreshNewsRound(store,input.issueDate,input.id)});
 if(input.action==='select')return json({plan:await selectNews(store,input.issueDate,input.roundId,input.ids,input.by)});
 if(input.action==='schedule')return json({runId:await startDaily(store,input.issueDate)});
 await selectNews(store,input.issueDate,input.roundId,input.ids);
 const job=await createWebJob(store,input.id,{kind:'news',issueDate:input.issueDate,roundId:input.roundId,sourceIds:input.ids,direction:input.direction,imageGeneration:true,autoSelect:false});
 await changeDocument<NewsPlan>(store,newsPlanKey(input.issueDate),()=>emptyNewsPlan(input.issueDate),p=>{p.jobId=job.id;p.updatedAt=new Date().toISOString();});
 const runId=await startEdition(store,job.id);return json({id:job.id,runId},201);
}catch(e){return webError(e);}}
