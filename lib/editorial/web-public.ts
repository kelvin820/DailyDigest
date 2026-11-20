import type {Edition} from '../../config/editions';
import {editionSchema} from '../schemas/edition';
import {databaseConfigured,documentStore,WEB_PREFIX} from './web-store';
import type {WebRelease} from './web-types';

export async function webReleases(){
 if(!databaseConfigured())return [];
 let rows:WebRelease[];
 try{rows=await documentStore().list<WebRelease>(WEB_PREFIX+'release:');}catch(e){const code=e instanceof Error?e.message:'';console.error('public_archive_fallback',{code:/^DATABASE_[A-Z_]+$/.test(code)?code:'DATABASE_READ_FAILED'});return [];}
 return rows.filter(r=>(r.approvalMethod==='web_manual'||r.approvalMethod==='scheduled_auto')&&r.editions.length===3).map(r=>({...r,editions:r.editions.map(i=>editionSchema.parse(i))})).sort((a,b)=>b.issueDate.localeCompare(a.issueDate));
}
export async function webPublishedIssue(edition:Edition,date?:string){return (await webReleases()).find(r=>!date||r.issueDate===date)?.editions.find(i=>i.edition===edition)??null;}
