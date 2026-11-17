'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function PublishingSettings({ initialMode, trialIssues, demo }: {
  initialMode: 'review' | 'auto'; trialIssues: number; demo: boolean;
}) {
  const [mode, setMode] = useState(initialMode), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const router = useRouter();
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/settings', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error);
      setMessage('發布模式已儲存。'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '設定失敗'); }
    finally { setBusy(false); }
  }
  return <section className="revision-actions" aria-label="發布模式">
    <h2>發布模式</h2><p>已記錄 {trialIssues} 期不同日期的家庭試讀。DEMO 不計入。</p>
    <label>模式<select value={mode} disabled={demo || busy}
      onChange={event => setMode(event.target.value as 'review' | 'auto')}>
      <option value="review">人工審核後發布</option>
      <option value="auto" disabled={trialIssues < 3}>通過檢查後自動發布</option>
    </select></label>
    <p>auto 仍會把敏感稿件與有問題的內容留待人工處理。排程與平台出刊設定須依部署指南啟用。</p>
    <button onClick={save} disabled={demo || busy}>{busy ? '儲存中…' : '儲存發布模式'}</button>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
