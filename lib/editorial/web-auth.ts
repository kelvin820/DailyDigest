import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';

export const EDITOR_COOKIE='dayday_editor';
export function editorSecret(){const secret=process.env.EDITOR_ACTION_SECRET?.trim();if(!secret||secret.length<24)throw Error('EDITOR_NOT_CONFIGURED');return secret;}
export function equalSecret(a:string,b:string){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
export function editorToken(secret:string,expires=Date.now()+8*3600000){const payload=String(expires);return payload+'.'+createHmac('sha256',secret).update('dayday-editor:'+payload).digest('hex');}
export function validEditorToken(token:string|undefined,secret:string,now=Date.now()){
 if(!token||!/^\d{13}\.[a-f0-9]{64}$/.test(token))return false;
 const expires=Number(token.split('.')[0]);return expires>now&&expires<=now+8*3600000+60000&&equalSecret(token,editorToken(secret,expires));
}
export async function requireEditor(){if(!validEditorToken((await cookies()).get(EDITOR_COOKIE)?.value,editorSecret()))throw Error('UNAUTHORIZED');}
export function editorOrigin(req:Request){
 const origin=req.headers.get('origin'),current=new URL(req.url).origin;
 if(!origin)throw Error('FORBIDDEN');
 // Next.js can normalize the internal request URL to localhost. The browser's
 // Host remains the actual served origin; scripts on other origins cannot set it.
 const host=req.headers.get('host'),external=new URL(origin);
 const canonical=process.env.APP_URL?new URL(process.env.APP_URL).origin:null;
 if(!['http:','https:'].includes(external.protocol)||origin!==current&&origin!==canonical&&external.host!==host)throw Error('FORBIDDEN');
}
export async function limitLogin(store:DocumentStore,now=Date.now()){
 // A shared limit, rather than instance-local memory; five attempts per minute.
 await changeDocument(store,WEB_PREFIX+'login:'+Math.floor(now/60000),()=>({version:0,count:0}),v=>{if(v.count>=5)throw Error('RATE_LIMIT');v.count++;});
}
