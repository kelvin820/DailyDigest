'use client';
import {useEffect,useState,type ReactNode} from 'react';

export async function editorialFetch(path:string,options:RequestInit={}){
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.message||'操作未完成，請重新載入查看狀態。');return data;
}
export function EditorGate({children}:{children:ReactNode}){
 const [unlocked,setUnlocked]=useState(false),[loaded,setLoaded]=useState(false),[secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;editorialFetch('/api/editorial/session').then(d=>{if(active)setUnlocked(d.unlocked);}).catch(()=>{if(active)setError('無法連線編輯室。');}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
 if(!loaded)return <p role="status">正在確認編輯室狀態…</p>;
 if(unlocked)return <><div className="editor-session"><span>編輯室已解鎖</span><button onClick={async()=>{try{await editorialFetch('/api/editorial/session',{method:'DELETE'});setUnlocked(false);}catch(e){setError((e as Error).message);}}}>鎖定編輯室</button></div>{children}</>;
 return <form className="editor-unlock" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await editorialFetch('/api/editorial/session',{method:'POST',body:JSON.stringify({secret})});setSecret('');setUnlocked(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><h2>解鎖編輯室</h2><p>輸入你設定的管理密碼，即可生成、審閱及發布。一般閱讀不需解鎖。</p><label>管理密碼<input type="password" autoComplete="current-password" required maxLength={512} value={secret} onChange={e=>setSecret(e.target.value)}/></label><button disabled={busy}>{busy?'確認中…':'解鎖'}</button>{error&&<p role="alert">{error}</p>}<p><a href="/editor/setup">檢查或初始化新的 Supabase →</a></p></form>;
}
