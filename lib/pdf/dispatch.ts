import {jobFingerprint} from '../editorial/web-jobs';
import type {WebJob} from '../editorial/web-types';
import type {Edition} from '../../config/editions';

export async function dispatchWebPdfs(job:WebJob,edition:Edition,folder='',fingerprint=jobFingerprint(job)){
 const key=process.env.CRON_SECRET?.trim(),base=process.env.APP_URL||process.env.VERCEL_PROJECT_PRODUCTION_URL&&'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL;
 if(!key||!base){if(process.env.VERCEL)throw Error('PDF_WORKER_NOT_CONFIGURED');return (await import('./vercel')).renderWebPdfs(job,edition,undefined,folder);}
 const origin=new URL(base);if(origin.protocol!=='https:'&&(process.env.VERCEL||origin.hostname!=='127.0.0.1'))throw Error('PDF_WORKER_ORIGIN');
 const response=await fetch(new URL('/api/internal/pdf',origin),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({id:job.id,edition,folder,fingerprint,...(folder?{releasedAt:job.editions[0].publishedAt}:{})}),signal:AbortSignal.timeout(70000)});
 const result=await response.json();if(!response.ok)throw Error(/^PDF_[A-Z_]+$/.test(result.error)?result.error:'PDF_WORKER_FAILED');
 return result.pdfs as WebJob['pdfs'];
}
