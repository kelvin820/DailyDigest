'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {editorialFetch} from './EditorGate';
import type {NewsSettings,NewsRound,NewsPlan,NewsCategory} from '../lib/editorial/news-config';
type Board={settings:NewsSettings;round:NewsRound|null;plan:NewsPlan|null;sources:{id:string;name:string;categories:readonly string[]}[];topics:Record<NewsCategory,string>};
export function NewsDesk({today}:{today:string}){
 const router=useRouter(),[board,setBoard]=useState<Board|null>(null),[settings,setSettings]=useState<NewsSettings|null>(null),[ids,setIds]=useState<string[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const autoRefresh=useRef(false),refreshId=useRef(crypto.randomUUID());
 const request=useCallback((body:unknown)=>editorialFetch('/api/editorial/news',{method:'POST',body:JSON.stringify(body)}),[]);
 const load=useCallback(async()=>{const d=await editorialFetch('/api/editorial/news?date='+today) as Board;setBoard(d);setSettings(d.settings);setIds(d.plan?.selectedIds??[]);return d;},[today]);
 const refresh=useCallback(async(current:NewsSettings,id:string)=>{
  setBusy('正在更新來源與整理 shortlist…');setError('');setMessage('');
  try{await request({action:'settings',settings:current});const d=await request({action:'refresh',issueDate:today,id});await load();if(d.round.status!=='ready')setMessage('正在整理候選故事，請稍後更新。');}
  catch(e){setError((e as Error).message);}finally{setBusy('');}
 },[request,today,load]);
 useEffect(()=>{let active=true;load().then(d=>{if(active&&!autoRefresh.current&&(!d.round||Date.now()-Date.parse(d.round.createdAt)>30*60000)&&!d.plan?.jobId){autoRefresh.current=true;void refresh(d.settings,refreshId.current);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[load,refresh]);
 async function choose(next:string[],by:'manual'|'llm'='manual'){
  if(!board?.round)return;setBusy('正在儲存選題…');setError('');
  try{const d=await request({action:'select',issueDate:today,roundId:board.round.id,ids:next,by});setIds(next);setBoard({...board,plan:d.plan});setMessage(next.length===4?'四篇選題已儲存，可立即生成。':'選擇已儲存；未選滿四篇時，排程由 LLM 自動選題。');}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 async function generate(){if(!board?.round||!settings)return;setBusy('正在建立背景生成工作…');setError('');try{const d=await request({action:'generate',issueDate:today,roundId:board.round.id,ids,direction:settings.direction,id:crypto.randomUUID()});router.push('/editor/jobs/'+d.id);}catch(e){setError((e as Error).message);setBusy('');}}
 async function save(){if(!settings)return;setBusy('正在儲存設定…');setError('');try{await request({action:'settings',settings});setMessage('Pool 與自動出刊設定已儲存。新的時間自下一次排程生效。');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 if(!board||!settings)return <section className="news-desk"><h2>即時選題室</h2><p role="status">正在讀取來源 pool…</p>{error&&<p role="alert">{error}</p>}</section>;
 const round=board.round;
 return <section className="news-desk"><div className="news-heading"><div><p className="eyebrow">LIVE STORY POOL</p><h2>今日選題 shortlist</h2></div><span>{today} · 已選 {ids.length} / 4</span></div>
  <p>從勾選的來源與題材中，讓 LLM 整理 8–10 篇有趣、重要且不重複的故事。你可以選四篇，或直接採用 LLM 的組合。</p>
  <details className="news-pool" open={!round}><summary>來源與題材 pool</summary><fieldset disabled={!!busy}><legend>新聞與故事來源</legend><div className="news-options">{board.sources.map(s=><label key={s.id}><input type="checkbox" checked={settings.sourceIds.includes(s.id)} onChange={e=>setSettings({...settings,sourceIds:e.target.checked?[...settings.sourceIds,s.id]:settings.sourceIds.filter(id=>id!==s.id)})}/>{s.name}</label>)}</div></fieldset>
   <fieldset disabled={!!busy}><legend>想看的題材</legend><div className="news-options">{Object.entries(board.topics).map(([id,name])=><label key={id}><input type="checkbox" checked={settings.topicIds.includes(id as NewsCategory)} onChange={e=>setSettings({...settings,topicIds:e.target.checked?[...settings.topicIds,id as NewsCategory]:settings.topicIds.filter(x=>x!==id)})}/>{name}</label>)}</div></fieldset></details>
  <div className="news-schedule"><label><input type="checkbox" checked={settings.autoEnabled} disabled={!!busy} onChange={e=>setSettings({...settings,autoEnabled:e.target.checked})}/>無人操作時，自動選題並出刊</label><label>台北時間<input aria-label="自動出刊時間" type="time" min="02:00" value={settings.publishTime} disabled={!!busy} onChange={e=>setSettings({...settings,publishTime:e.target.value})}/></label><button onClick={save} disabled={!!busy||!settings.sourceIds.length||!settings.topicIds.length}>儲存 pool 與排程</button><p>預定時間前 30 分鐘開始準備，採用已儲存的四篇；未選滿時由 LLM 選擇。生成、複核與 PDF 通過後發布，關閉網頁仍會繼續。</p></div>
  <label className="news-direction">選題與寫稿方向<textarea rows={2} maxLength={1200} value={settings.direction} disabled={!!busy} onChange={e=>setSettings({...settings,direction:e.target.value})}/></label>
  <div className="news-actions"><button onClick={()=>void refresh(settings,crypto.randomUUID())} disabled={!!busy||!settings.sourceIds.length||!settings.topicIds.length}>更新 shortlist</button><button onClick={()=>void choose(round?.recommendedIds??[],'llm')} disabled={!!busy||round?.recommendedIds.length!==4}>LLM 幫我選四篇</button><button className="news-primary" onClick={generate} disabled={!!busy||ids.length!==4}>以這四篇生成三種程度</button></div>
  {round&&<p className="news-updated">更新於 {new Date(round.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})} · {round.candidates.length} 篇候選{round.failures.length>0&&' · 部分來源暫時無法讀取'}</p>}
  <div className="news-shortlist">{round?.candidates.map((c,i)=><label key={c.id} className={'news-story'+(ids.includes(c.id)?' selected':'')}><input type="checkbox" checked={ids.includes(c.id)} disabled={!!busy||ids.length===4&&!ids.includes(c.id)} onChange={e=>void choose(e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><div><div className="news-story-meta">{String(i+1).padStart(2,'0')} · {board.topics[c.category]} · {c.publisher}</div><h3>{c.titleZh||c.title}</h3><p>{c.summaryZh}</p><p className="news-reason">{c.whyZh}</p><small>{new Date(c.publishedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})} · <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>閱讀來源 ↗</a>{round.recommendedIds.includes(c.id)&&' · LLM 推薦'}</small></div></label>)}</div>
  {board.plan?.jobId&&<p><Link href={'/editor/jobs/'+board.plan.jobId}>查看本期生成工作 →</Link></p>}
  {board.plan?.error&&<p role="alert">自動出刊需要處理：{board.plan.error}</p>}{busy&&<p role="status">{busy}</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
