import {cookies} from 'next/headers';
import {z} from 'zod';
import {json} from '../../../../lib/api';
import {editorOrigin,editorSecret,equalSecret,editorToken,validEditorToken,limitLogin,EDITOR_COOKIE} from '../../../../lib/editorial/web-auth';
import {documentStore} from '../../../../lib/editorial/web-store';
import {webError,requestBody} from '../../../../lib/editorial/web-api';
export const runtime='nodejs';
export async function GET(){let unlocked=false;try{unlocked=validEditorToken((await cookies()).get(EDITOR_COOKIE)?.value,editorSecret());}catch{}return json({unlocked});}
export async function POST(req:Request){try{
 editorOrigin(req);const {secret}=z.object({secret:z.string().min(1).max(512)}).strict().parse(await requestBody(req));
 const expected=editorSecret();await limitLogin(documentStore());if(!equalSecret(secret,expected))throw Error('UNAUTHORIZED');
 (await cookies()).set(EDITOR_COOKIE,editorToken(expected),{httpOnly:true,secure:process.env.VERCEL==='1'||new URL(req.url).protocol==='https:'||req.headers.get('x-forwarded-proto')==='https',sameSite:'strict',path:'/',maxAge:8*3600});
 return json({unlocked:true});
}catch(e){return webError(e);}}
export async function DELETE(req:Request){try{editorOrigin(req);(await cookies()).delete(EDITOR_COOKIE);return json({unlocked:false});}catch(e){return webError(e);}}
