'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {EditorGate,editorialFetch} from './EditorGate';
export function PacketRelease({packetId,fingerprint}:{packetId:string;fingerprint:string}){
 const [open,setOpen]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[jobId,setJobId]=useState('');const id=useRef('');
 async function release(){
  if(!reviewed)return;setBusy(true);setMessage('正在保存審核稿並製作新版 PDF…');
  try{
   id.current ||= crypto.randomUUID();setJobId(id.current);
   await editorialFetch('/api/editorial/jobs/import',{method:'POST',body:JSON.stringify({id:id.current,packetId,fingerprint})});
   for(let step=0;step<5;step++){
    const data=await editorialFetch('/api/editorial/jobs/'+id.current,{method:'POST'});
    if(data.job.status==='needs_attention')throw Error('PDF 製作尚未完成，請進入工作紀錄重試，已審稿件已保留。');
    if(data.job.status==='needs_review'){
     if(!data.canPublish)throw Error('仍有稿件檢查未通過，請進入工作紀錄修訂。');
     setMessage('正在儲存審核通過與發布紀錄…');
     await editorialFetch('/api/editorial/jobs/'+id.current+'/publish',{method:'POST',body:JSON.stringify({fingerprint:data.fingerprint,reviewed:true})});
     setMessage('審核通過，已發布到首頁與日曆。');return;
    }
   }
   throw Error('PDF 仍在製作，請進入工作紀錄繼續。');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 if(!open)return <button className="review-publish" onClick={()=>setOpen(true)}>審核通過並放行</button>;
 return <EditorGate><section><label className="editor-confirm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/>我已完成三版正文、來源、單字與配圖審核，同意放行</label><button className="review-publish" disabled={!reviewed||busy} onClick={release}>{busy?'正在準備發布…':'審核通過並放行'}</button><p className="review-help">沿用已審稿件製作新版 PDF，完成後發布；不會重新呼叫模型。</p>{message&&<p role="status">{message}</p>}{jobId&&<Link href={'/editor/jobs/'+jobId}>查看生成與發布工作 →</Link>}</section></EditorGate>;
}
