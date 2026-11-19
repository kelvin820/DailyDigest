import {publishedPdf,publishedIssues} from '../../../../../lib/publications/catalog';
import {readingMode} from '../../../../../lib/reader/mode.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {demoMode,previewMode,membership} from '../../../../../lib/auth/server';
import {editionOf} from '../../../../../config/editions';
import {DEMO_DATE} from '../../../../../fixtures/issue';
import {PREVIEW_DATE,previewIssue} from '../../../../../lib/reader/preview';
import {json,apiError} from '../../../../../lib/api';
import {validDate} from '../../../../../lib/content/metrics';

export async function GET(req:Request,{params}:{params:Promise<{date:string}>}) {
  try {
    const {date}=await params;
    if(!validDate(date))return json({error:'INVALID_DATE'},400);
    const u=new URL(req.url),edition=editionOf(u.searchParams.get('edition'));
    const mode=u.searchParams.get('mode')==='ink'?'ink':'color';
    if(readingMode()==='public'){const path=publishedPdf(date,edition,mode);if(path)return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'private, no-store'}});if(publishedIssues().length)return json({error:'NOT_FOUND'},404);}
    if(previewMode()) {
      if(date!==PREVIEW_DATE)return json({error:'NOT_FOUND'},404);
      const issue=previewIssue(edition);
      return new Response(null,{status:303,headers:{
        Location:`/preview-issues/${date}/DD_${date}_${edition}_r${issue.revision}_${mode}.pdf`,
        'Cache-Control':'private, no-store',
      }});
    }
    if(demoMode()) {
      if(date!==DEMO_DATE)return json({error:'NOT_FOUND'},404);
      try {
        const name=`DD_${date}_${edition}_r1_${mode}.pdf`;
        const bytes=await readFile(resolve('output/preview',name));
        return new Response(bytes,{headers:{'Content-Type':'application/pdf',
          'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store'}});
      } catch {
        return json({error:'DEMO_PDF_NOT_RENDERED',message:'PDF 暫時無法下載，請稍後再試。'},503);
      }
    }
    const {db}=await membership();
    const {data:i}=await db.from('issues').select('current_revision_id').eq('issue_date',date).single();
    if(!i?.current_revision_id)return json({error:'NOT_FOUND'},404);
    const {data:f}=await db.from('issue_files').select('storage_path')
      .eq('revision_id',i.current_revision_id).eq('edition',edition).eq('print_mode',mode).single();
    if(!f)return json({error:'NOT_FOUND'},404);
    const {data,error}=await db.storage.from('issue-files').createSignedUrl(f.storage_path,60);
    if(error)throw error;
    return new Response(null,{status:303,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store'}});
  } catch(e){return apiError(e);}
}
