import {z} from 'zod';
import {json} from '../../../../lib/api';
import {requireEditor,editorOrigin} from '../../../../lib/editorial/web-auth';
import {documentStore,WEB_PREFIX} from '../../../../lib/editorial/web-store';
import {createWebJob} from '../../../../lib/editorial/web-jobs';
import type {WebJob} from '../../../../lib/editorial/web-types';
import {webError,requestBody} from '../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{await requireEditor();const jobs=await documentStore().list<WebJob>(WEB_PREFIX+'job:');return json({jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(j=>({id:j.id,issueDate:j.issueDate,status:j.status,createdAt:j.createdAt,error:j.error,usage:j.usage}))});}catch(e){return webError(e);}}
export async function POST(req:Request){try{editorOrigin(req);await requireEditor();const id=z.uuid().parse(req.headers.get('idempotency-key'));return json({job:await createWebJob(documentStore(),id,await requestBody(req))},201);}catch(e){return webError(e);}}
