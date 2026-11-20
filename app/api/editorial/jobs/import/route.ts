import {z} from 'zod';
import {json} from '../../../../../lib/api';
import {requireEditor,editorOrigin} from '../../../../../lib/editorial/web-auth';
import {documentStore} from '../../../../../lib/editorial/web-store';
import {importReviewPacket} from '../../../../../lib/editorial/web-jobs';
import {webError,requestBody} from '../../../../../lib/editorial/web-api';
export async function POST(req:Request){try{
 editorOrigin(req);await requireEditor();const input=z.object({id:z.uuid(),packetId:z.string(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await requestBody(req));
 return json({job:await importReviewPacket(documentStore(),input.id,input.packetId,input.fingerprint)},201);
}catch(e){return webError(e);}}
