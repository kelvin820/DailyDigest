'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {editionKeys,editions,type Edition} from '../config/editions';
import type {WebJob} from '../lib/editorial/web-types';
import type {SourceChoice} from '../lib/editorial/library';
import {ArticleContent} from './Article';
import {editorialFetch} from './EditorGate';
import {modelStepTimings} from '../lib/editorial/web-timing';
import {jobStatus} from './EditorialDesk';
import {StoryRegeneration} from './StoryRegeneration';

export function WebJobReview({id,choices}:{id:string;choices:SourceChoice[]}){
 const [recoveryVersion,setRecoveryVersion]=useState(0);
 const [job,setJob]=useState<WebJob|null>(null),[error,setError]=useState(''),[running,setRunning]=useState(true),[edition,setEdition]=useState<Edition>('elementary'),[fingerprint,setFingerprint]=useState(''),[canPublish,setCanPublish]=useState(false),[reviewed,setReviewed]=useState(false),[published,setPublished]=useState(false),[publishing,setPublishing]=useState(false);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>;
  async function refresh(advance=false){
   try{
    const data=await editorialFetch('/api/editorial/jobs/'+id,advance?{method:'POST'}:{});if(!active)return;
    setJob(data.job);setFingerprint(data.fingerprint);setCanPublish(data.canPublish);
    if(running&&['pending','running'].includes(data.job.status))timer=setTimeout(()=>refresh(true),data.job.lease?1500:250);
   }catch(e){if(active){setError((e as Error).message);setRunning(false);}}
  }
  refresh();return()=>{active=false;clearTimeout(timer);};
 },[id,running,recoveryVersion]);
 const issue=job?.editions.find(i=>i.edition===edition);
 async function retryPdfs(){setError('');try{const data=await editorialFetch('/api/editorial/jobs/'+id,{method:'PATCH'});setJob(data.job);setRunning(true);setRecoveryVersion(v=>v+1);}catch(e){setError((e as Error).message);}}
 async function publish(){setPublishing(true);setError('');try{await editorialFetch('/api/editorial/jobs/'+id+'/publish',{method:'POST',body:JSON.stringify({fingerprint,reviewed})});setPublished(true);}catch(e){setError((e as Error).message);}finally{setPublishing(false);}}
 if(!job)return <p role={error?'alert':'status'}>{error||'正在讀取生成工作…'}</p>;
 return <><header><p className="eyebrow">DAYDAY EDITORIAL</p><h1>{job.issueDate} · {published?'已發布':jobStatus(job.status)}</h1><p>已記錄 {job.usage.calls} 次模型回應 · {(job.usage.inputTokens+job.usage.outputTokens).toLocaleString()} tokens · {job.pdfs.length} / 6 份 PDF</p><p className="review-help">金額依供應商實際計費；未設定費率時只顯示呼叫與 token 用量。</p></header>{error&&<p role="alert">{error}</p>}{['pending','running'].includes(job.status)&&<section className="editor-progress"><p role="status">{running?'正在由後端分步生成並儲存。':'生成已暫停。'}</p><button onClick={()=>{setError('');setRunning(!running);}}>{running?'完成這批後暫停':'繼續生成'}</button></section>}{job.status==='needs_attention'&&<aside className="source-audit"><h2>需要處理</h2><p>{job.error==='USAGE_RECONCILIATION_REQUIRED'?'上次請求的結果或用量尚未確認，系統已停止，避免重複呼叫。請保留此工作紀錄，核對後再處理。':job.error==='BUDGET_EXCEEDED'?'今天的生成額度已用盡，已完成的結果仍保存在資料庫。':'生成未全部完成，已保存成功步驟與錯誤紀錄。'}</p><code>{job.error}</code><p>你仍可查看下方已儲存的紀錄。</p>{!job.editions.length&&!job.activeStep&&(job.error==='GENERATION_FAILED'||job.error?.startsWith('NEEDS_REVIEW:'))&&<><button onClick={retryPdfs}>依檢查結果繼續生成</button><p>保留先前成功回應；新的模型步驟會計入生成額度。</p></>}{job.editions.length===3&&!job.activeStep&&<button onClick={retryPdfs}>只重試 PDF，保留已生成稿件</button>}</aside>}<details open={!issue} className="review-records"><summary>生成進度與 log</summary><p>已完成步驟：{modelStepTimings(job.events).map(g=>g.label+' '+g.count+' 次／'+Math.round(g.ms/1000)+' 秒').join(' · ')}。紀錄時間包含模型請求與存檔。</p><ol>{job.events.map((e,i)=><li key={i}><time>{new Date(e.at).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'})}</time> · {e.message}</li>)}</ol><p>工作編號：{job.id}</p></details>{issue&&<><section className="reading-tools"><div className="edition-picker">{editionKeys.map(e=><button key={e} aria-pressed={edition===e} onClick={()=>setEdition(e)}>{editions[e].label}<small>{editions[e].cefr}</small></button>)}</div><div className="downloads">{job.pdfs.filter(p=>p.edition===edition).map(p=><a key={p.mode} href={'/api/editorial/files?id='+id+'&edition='+edition+'&mode='+p.mode}>{p.mode==='color'?'彩色':'省墨'} PDF · {p.pages} 頁</a>)}</div></section><section className={'newspaper review-paper '+edition} style={{'--paper':editions[edition].paper,'--accent':editions[edition].accent} as React.CSSProperties}><div className="article-grid">{issue.articles.map(a=>{const review=job.reviews.find(r=>r.edition===edition&&r.storyId===a.storyId);return <article key={a.storyId} className="article"><ArticleContent article={a}/><section className="editorial-assessment"><h3>模型複核</h3>{review?<><p>事實：{review.factual_status} · 程度：{review.level_fit} · 適齡：{review.suitability}</p>{review.issues.map((r,i)=><p key={i}>{r.severity} · {r.reason} · {r.suggested_action}</p>)}</>:<p>尚未完成複核</p>}</section>{job.status==='needs_review'&&<StoryRegeneration key={edition+fingerprint+a.storyId} base={{kind:'benchmark',id,fingerprint,round:1}} storyId={a.storyId} category={a.category} edition={edition} choices={choices} usedStoryIds={issue.articles.map(a=>a.storyId)}/>}</article>;})}</div></section></>}<section className="review-summary"><h2>審核與放行</h2>{published?<p>已儲存發布紀錄，<Link href={'/issues/'+job.issueDate}>閱讀這一期 →</Link></p>:<><p>請檢查三版正文、來源、單字與六份 PDF。核准後會立即更新首頁與已出刊日曆。</p>{!canPublish&&<p role="status">{job.pdfs.length<6?'PDF 尚未完成，完成後即可放行；稿件已儲存。':'模型複核或稿件檢查仍有未通過項目，請先修訂需要處理的文章。'}</p>}<label className="editor-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>我已檢查這個版本的三版內容與 PDF</label><button className="review-publish" disabled={!canPublish||!reviewed||publishing} onClick={publish}>{publishing?'正在發布…':'審核通過並發布'}</button></>}</section></>;
}
