import {equalSecret} from '../../../../lib/editorial/web-auth';
import {documentStore} from '../../../../lib/editorial/web-store';
import {startDaily} from '../../../../lib/editorial/background';
import {taipeiDate} from '../../../../lib/content/metrics';
import {json} from '../../../../lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const key=process.env.CRON_SECRET?.trim();if(!key||!equalSecret(req.headers.get('authorization')||'','Bearer '+key))return json({error:'UNAUTHORIZED'},401);
 const date=taipeiDate();return json({date,runId:await startDaily(documentStore(),date)});
}
