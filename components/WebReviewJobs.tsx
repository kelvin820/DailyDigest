'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {EditorGate,editorialFetch} from './EditorGate';
import {jobStatus} from './EditorialDesk';
type Job={id:string;issueDate:string;createdAt:string;status:string;error:string|null};
function Jobs(){
 const [jobs,setJobs]=useState<Job[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;editorialFetch('/api/editorial/jobs').then(data=>{if(active)setJobs(data.jobs);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);
 return <>{error?<p role="alert">{error}</p>:jobs===null?<p role="status">正在讀取待審稿…</p>:jobs.length?jobs.map(j=><Link className="review-card" key={j.id} href={'/editor/jobs/'+j.id}><strong>{j.issueDate} · {jobStatus(j.status)}</strong><span>{new Date(j.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</span><small>查看三版、PDF、生成 log 與審核放行 →</small></Link>):<p>還沒有從網頁生成的稿件。</p>}</>;
}
export function WebReviewJobs(){return <section className="review-dashboard"><h2>網頁生成與待審稿</h2><EditorGate><Jobs/></EditorGate></section>;}
