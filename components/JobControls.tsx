'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function DispatchControls({ enabled, issueDate }: { enabled: boolean; issueDate: string }) {
  const [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  async function dispatch(form: FormData) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({issue_date:form.get('date'),resume:true,draft_only:true,force_new_revision:form.has('newRevision')})});
      const result = await response.json(); if(!response.ok)throw Error(result.error);
      setMessage('GitHub 已接受派送請求；生成與發布尚未完成，請查看工作紀錄。');
    }catch(error){setMessage(error instanceof Error?error.message:'派送失敗')}finally{setBusy(false)}
  }
  return <section className="revision-actions"><h2>手動出刊／續跑</h2>
    {!enabled&&<p>尚未設定派送憑證或完成 live 驗收。可依部署指南在 GitHub Actions 手動執行；目前不會派送假工作。</p>}
    <form action={dispatch}><fieldset disabled={!enabled||busy}>
      <label>期刊日<input type="date" name="date" defaultValue={issueDate} required/></label>
      <label><input type="checkbox" name="newRevision"/> 明確建立新修訂版（可能產生新的模型用量）</label>
      <p>預設續跑並只產生待審稿件；已完成且輸入相同的步驟會重用。</p>
      <button type="submit">{busy?'派送中…':'派送待審工作'}</button>
    </fieldset></form><p role="status" aria-live="polite">{message}</p>
  </section>;
}
export function JobDetails({ id }: { id: string }) {
  const [report,setReport]=useState<unknown>(null),[message,setMessage]=useState('');
  const router=useRouter();
  async function load(){setMessage('讀取中…');try{const response=await fetch('/api/admin/jobs/'+id,{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error);setReport(data);setMessage('');router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'讀取失敗')}}
  async function acknowledge(form:FormData){setMessage('儲存中…');try{
    const response=await fetch('/api/admin/jobs/'+id+'/acknowledge',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({notes:form.get('notes')})});const data=await response.json();if(!response.ok)throw Error(data.error);
    setMessage(data.note);router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'核對失敗')}}
  return <div><button onClick={load}>查看步驟與用量</button><p role="status">{message}</p>
    {report!==null&&<pre className="review-report">{JSON.stringify(report,null,2)}</pre>}
    <details><summary>已核對 NVIDIA 的不明用量，允許再次嘗試</summary><p>先確認供應商紀錄。此操作不會清除未知費用或預留額度；工作仍在執行時不能操作。</p>
      <form action={acknowledge}><label>核對與重試理由<textarea name="notes" required maxLength={1000} rows={2}/></label>
        <button type="submit">記錄核對結果並允許續跑</button></form></details></div>;
}
