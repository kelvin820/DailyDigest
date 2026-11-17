'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { editions, editionKeys, type Edition } from '../config/editions';
import type { EditionView } from '../lib/schemas/edition';
import { revisionInput, revisedPayload } from '../lib/schemas/revision';

export function RevisionActions({ id, fingerprint, status, canApprove, payloads, demo }: {
  id: string; fingerprint: string; status: string; canApprove: boolean;
  payloads: EditionView[]; demo: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState<Edition>('elementary');
  const [storyId, setStoryId] = useState(payloads[0]?.articles[0]?.storyId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const issue = payloads.find(p => p.edition === edition);
  const article = issue?.articles.find(a => a.storyId === storyId);

  async function approve() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/revisions/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedFingerprint: fingerprint }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage('已發布，讀者可取得這個版本。'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '發布失敗'); }
    finally { setBusy(false); }
  }
  async function revise(form: FormData) {
    if (!issue || !article) return;
    setBusy(true); setMessage('');
    try {
      const input = revisionInput.parse({ expectedFingerprint: fingerprint, edition, storyId,
        headline: form.get('headline'),
        bodyParagraphs: String(form.get('body') || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean),
        vocabulary: article.vocabulary.map((_, i) => ({ term: form.get(`term-${i}`),
          definitionEn: form.get(`definition-${i}`), meaningZhHant: form.get(`meaning-${i}`) })),
        correctionNote: form.get('correction'),
      });
      revisedPayload(issue, input);
      const response = await fetch(`/api/admin/revisions/${id}/revise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage(result.note); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗'); }
    finally { setBusy(false); }
  }
  async function recordTrial(form: FormData) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/revisions/${id}/trial`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: form.get('notes') }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error);
      setMessage(`已記錄家庭試讀，目前共 ${result.trialIssues} 期。`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '記錄失敗'); }
    finally { setBusy(false); }
  }
  return <section className="revision-actions" aria-label="審稿操作">
    <p>版本狀態：{demo ? 'DEMO，尚未執行真實審稿' : status}</p>
    <button onClick={approve} disabled={demo || busy || !canApprove}>
      {busy ? '處理中…' : '核准並發布這個版本'}
    </button>
    {!canApprove && <p>須通過事實、程度與六份 PDF 檢查，才能核准發布。</p>}
    <details><summary>編輯文章並建立新修訂版</summary>
      <p>儲存後需重新複核、產生 PDF。讀者會繼續看到上一個已發布版本。</p>
      <label>版本<select value={edition} onChange={e => setEdition(e.target.value as Edition)}>
        {editionKeys.map(e => <option key={e} value={e}>{editions[e].label}</option>)}
      </select></label>
      <label>文章<select value={storyId} onChange={e => setStoryId(e.target.value)}>
        {issue?.articles.map(a => <option key={a.storyId} value={a.storyId}>{a.order}. {a.headline}</option>)}
      </select></label>
      {article && <form key={id + edition + storyId} action={revise}>
        <fieldset disabled={demo || busy}>
          <label>英文標題<input name="headline" defaultValue={article.headline} required maxLength={130}/></label>
          <label>英文正文（段落之間空一行）<textarea name="body" rows={7}
            defaultValue={article.bodyParagraphs.join('\n\n')} required/></label>
          {article.vocabulary.map((v, i) => <div key={i} className="vocabulary-editor">
            <label>詞彙 {i + 1}<input name={`term-${i}`} defaultValue={v.term} required/></label>
            <label>簡單英文解釋<input name={`definition-${i}`} defaultValue={v.definitionEn} required/></label>
            <label>繁體中文意思<input name={`meaning-${i}`} defaultValue={v.meaningZhHant} required/></label>
          </div>)}
          <label>修訂／更正說明<textarea name="correction" rows={2} required maxLength={500}/></label>
          <button type="submit">儲存為新修訂版</button>
        </fieldset>
      </form>}
    </details>
    <details><summary>記錄本期家庭試讀</summary>
      <p>讀完後記下版本、難易、查字與是否想繼續；請省略孩子姓名與學校。只有已發布的真實期刊能計入。</p>
      <form action={recordTrial}><label>試讀觀察<textarea name="notes" rows={3} required maxLength={2000}/></label>
        <button type="submit" disabled={demo || busy || status !== 'published'}>記錄本期試讀</button></form>
    </details>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
