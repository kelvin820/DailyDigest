'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import type {SourceChoice} from '../lib/editorial/library';
import {editorialFetch} from './EditorGate';

type JobSummary={id:string;issueDate:string;status:string;createdAt:string;error:string|null};
export const jobStatus=(status:string)=>({pending:'等待生成',running:'生成中',needs_review:'待你審閱',needs_attention:'需要處理'}[status]||status);
export function EditorialDesk({choices,today}:{choices:SourceChoice[];today:string}){
 const router=useRouter(),[ids,setIds]=useState<string[]>([]),[date,setDate]=useState(today),[direction,setDirection]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[jobs,setJobs]=useState<JobSummary[]>([]);
 useEffect(()=>{let active=true;editorialFetch('/api/editorial/jobs').then(d=>{if(active)setJobs(d.jobs);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function generate(){
  setBusy(true);setError('');
  try{const id=crypto.randomUUID();await editorialFetch('/api/editorial/jobs',{method:'POST',headers:{'Idempotency-Key':id},body:JSON.stringify({kind:'generate',issueDate:date,sourceIds:ids,direction})});router.push('/editor/jobs/'+id);}catch(e){setError((e as Error).message);setBusy(false);}
 }
 return <><section className="editor-create"><h2>製作新一期</h2><p>選擇四篇已核對來源的故事，生成三種程度、各自的學習單字與六份 PDF。新稿先存入待審區，核准前首頁維持目前刊物。</p><label>刊物日期<input type="date" value={date} max={today} onChange={e=>setDate(e.target.value)} required/></label><fieldset><legend>選擇四篇來源（已選 {ids.length} / 4）</legend>{choices.length?choices.map(c=><label key={c.id} className="editor-source"><input type="checkbox" checked={ids.includes(c.id)} disabled={busy||ids.length===4&&!ids.includes(c.id)} onChange={e=>setIds(e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span>{c.label}<small>{c.publisher} · <a href={c.url} target="_blank" rel="noopener noreferrer">查看來源 ↗</a></small></span></label>):<p>目前沒有在本期日期範圍內的已核對來源。</p>}</fieldset><label>這一期的編輯方向（選填）<textarea rows={3} maxLength={1200} value={direction} onChange={e=>setDirection(e.target.value)} placeholder="例如：用具體的真實細節吸引孩子，解釋和日常生活的關係。"/></label><button className="review-publish" disabled={busy||ids.length!==4||!date} onClick={generate}>{busy?'正在儲存…':'生成三版刊物'}</button><p className="review-help">按下後會使用你的生成額度。寫稿、複核、PDF 與進度會儲存；離開頁面會在目前批次完成後暫停，下次可繼續。</p>{error&&<p role="alert">{error}</p>}</section><section className="review-dashboard"><h2>資料庫中的生成紀錄</h2>{jobs.length?jobs.map(j=><Link className="review-card" key={j.id} href={'/editor/jobs/'+j.id}><strong>{j.issueDate} · {jobStatus(j.status)}</strong><span>{new Date(j.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</span>{j.error&&<small>{j.error}</small>}</Link>):<p>還沒有網頁生成紀錄。先前的稿件仍保留在<Link href="/review">歷史審查區</Link>。</p>}</section></>;
}
