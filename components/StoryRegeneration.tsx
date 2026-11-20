'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {editorialCategories,regenerationRequestSchema,type EditorialCategory,type RegenerationRequest} from '../lib/editorial/requests';
import type {SourceChoice} from '../lib/editorial/library';
import type {Edition} from '../config/editions';
import {EditorGate,editorialFetch} from './EditorGate';

export function StoryRegeneration({base,storyId,category,edition,choices,usedStoryIds}:{base:RegenerationRequest['base'];storyId:string;category:EditorialCategory;edition:Edition;choices:SourceChoice[];usedStoryIds:string[]}){
 const router=useRouter(),requestId=useRef<string|null>(null);
 const [open,setOpen]=useState(false);
 const [mode,setMode]=useState<'rewrite'|'replace'>('rewrite'),[topic,setTopic]=useState<EditorialCategory>(category),[source,setSource]=useState(''),[scope,setScope]=useState('all'),[direction,setDirection]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [ratings,setRatings]=useState<Partial<Record<'interest'|'information'|'readability',number>>>({});
 const available=choices.filter(c=>c.category===topic&&!usedStoryIds.includes(c.id));
 const clear=()=>{requestId.current=null;setMessage('');};
 async function generate(){
  const parsed=regenerationRequestSchema.safeParse({version:1,base,storyId,mode,category:mode==='rewrite'?category:topic,...(mode==='replace'?{replacementFactId:source}:{}),editions:mode==='replace'||scope==='all'?['elementary','junior','senior']:[edition],direction,ratings});
  if(!parsed.success){setMessage(parsed.error.issues.map(i=>i.message).join('；'));return;}
  setBusy(true);setMessage('正在儲存生成要求…');
  try{requestId.current??=crypto.randomUUID();await editorialFetch('/api/editorial/jobs',{method:'POST',headers:{'Idempotency-Key':requestId.current},body:JSON.stringify({kind:'regenerate',request:parsed.data})});router.push('/editor/jobs/'+requestId.current);}catch(e){setMessage((e as Error).message);setBusy(false);}
 }
 return <details className="story-regeneration" onToggle={e=>setOpen(e.currentTarget.open)}><summary>評語與單篇重新生成</summary>{open&&<EditorGate><fieldset disabled={busy}><legend>重新生成這篇故事</legend><p>新稿另存，另外三篇與首頁保留目前版本。</p><div className="editorial-scores">{([['interest','趣味性'],['information','資訊性'],['readability','可讀性']] as const).map(([key,label])=><label key={key}>{label}<select aria-label={label+'評分'} value={ratings[key]||''} onChange={e=>{setRatings({...ratings,[key]:e.target.value?Number(e.target.value):undefined});clear();}}><option value="">未評分</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div><label>處理方式<select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);clear();}}><option value="rewrite">保留主題，重新改寫</option><option value="replace">指定類別，換一個主題</option></select></label>{mode==='rewrite'?<label>重生範圍<select value={scope} onChange={e=>{setScope(e.target.value);clear();}}><option value="all">這篇的三個程度</option><option value="current">僅目前程度</option></select></label>:<><label>新主題類別<select value={topic} onChange={e=>{setTopic(e.target.value as EditorialCategory);setSource('');clear();}}>{Object.entries(editorialCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>已核對來源的候選故事<select value={source} onChange={e=>{setSource(e.target.value);clear();}}><option value="">請選擇來源</option>{available.map(c=><option key={c.id} value={c.id}>{c.publisher} · {c.label}</option>)}</select></label>{!available.length&&<p role="status">這個類別目前待補來源。</p>}{source&&<a href={available.find(c=>c.id===source)?.url} target="_blank" rel="noopener noreferrer">先讀候選故事來源 ↗</a>}<p>換題會同步三版，先使用分類圖示。</p></>}<label>想改善的地方<textarea maxLength={1200} rows={3} value={direction} onChange={e=>{setDirection(e.target.value);clear();}} placeholder="例如：以來源中最有趣的真實細節開頭，減少抽象用語。"/></label><button type="button" disabled={mode==='replace'&&!source||!direction.trim()} onClick={generate}>{busy?'正在建立…':'重新生成並儲存新稿'}</button></fieldset><p role="status" aria-live="polite">{message}</p></EditorGate>}</details>;
}
