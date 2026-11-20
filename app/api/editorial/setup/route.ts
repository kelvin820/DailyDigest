import {cookies} from 'next/headers';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {json} from '../../../../lib/api';
import {editorOrigin,editorSecret,equalSecret,editorToken,requireEditor,validSetupAuthorization,EDITOR_COOKIE} from '../../../../lib/editorial/web-auth';
import {requestBody,webError} from '../../../../lib/editorial/web-api';
import {withSetupDatabase,inspectDatabase,initializeDatabase} from '../../../../lib/editorial/web-setup';
import {documentStore,serviceDatabase,WEB_PREFIX} from '../../../../lib/editorial/web-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect'),secret:z.string().min(1).max(512).optional()}).strict(),
 z.object({action:z.literal('initialize'),confirmedProjectUrl:z.url(),reviewed:z.literal(true)}).strict(),
 z.object({action:z.literal('verify')}).strict(),
]);
export async function POST(req:Request){try{
 editorOrigin(req);const input=schema.parse(await requestBody(req));
 const automation=validSetupAuthorization(req.headers.get('authorization'));
 if(automation){/* Short-lived owner-provisioned setup token; no editor session. */}
 else if(input.action==='inspect'&&input.secret){
  if(!equalSecret(input.secret,editorSecret()))throw Error('UNAUTHORIZED');
  (await cookies()).set(EDITOR_COOKIE,editorToken(editorSecret()),{httpOnly:true,secure:process.env.VERCEL==='1'||new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:8*3600});
 }else await requireEditor();
 if(input.action==='verify'){
  const id=randomUUID(),store=documentStore(),key=WEB_PREFIX+'health:'+id;
  if(!await store.create(key,{version:1,kind:'setup_verification',createdAt:new Date().toISOString()}))throw Error('SETUP_VERIFICATION_FAILED');
  if(!await store.compare(key,1,{version:2,kind:'setup_verification',verifiedAt:new Date().toISOString()}))throw Error('SETUP_VERIFICATION_FAILED');
  if((await store.get<{version:number}>(key))?.version!==2)throw Error('SETUP_VERIFICATION_FAILED');
  const bucket=serviceDatabase().storage.from('issue-files'),path='setup-probe/'+id+'.txt',contents='DayDay private storage verification '+id;
  const metadata=await serviceDatabase().storage.getBucket('issue-files');if(metadata.error||metadata.data?.public!==false)throw Error('SETUP_VERIFICATION_FAILED');
  const uploaded=await bucket.upload(path,Buffer.from(contents),{contentType:'text/plain',upsert:false});if(uploaded.error)throw Error('SETUP_VERIFICATION_FAILED');
  try{
   const downloaded=await bucket.download(path);if(downloaded.error||await downloaded.data.text()!==contents)throw Error('SETUP_VERIFICATION_FAILED');
   const signed=await bucket.createSignedUrl(path,60);if(signed.error||!signed.data?.signedUrl)throw Error('SETUP_VERIFICATION_FAILED');
  }finally{const removed=await bucket.remove([path]);if(removed.error)throw Error('SETUP_VERIFICATION_FAILED');}
  return json({databaseReadWrite:true,compareAndSwap:true,privateStorage:true,signedDownloads:true});
 }
 return await withSetupDatabase(async(client,projectUrl)=>{
  if(input.action==='inspect')return json({projectUrl,...await inspectDatabase(client)});
  const result=await initializeDatabase(client,projectUrl,input.confirmedProjectUrl);
  console.info('editorial_database_initialized',{migrations:result.migrations});return json({success:true,...result});
 });
}catch(e){return webError(e);}}
