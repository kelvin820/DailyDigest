import Link from 'next/link';
import { pageMember, membership, demoMode } from '../../../lib/auth/server';
import { PublishingSettings } from '../../../components/PublishingSettings';
import sources from '../../../config/sources.json';
import {editions,editionKeys} from '../../../config/editions';
export const dynamic = 'force-dynamic';
export default async function Settings() {
  await pageMember(true);
  const demo = demoMode();
  let mode: 'review' | 'auto' = 'review', trials = 0;
  if (!demo) {
    const { db } = await membership(true);
    const { data, error } = await db.from('app_settings').select('value').eq('key','publishing').single();
    if (error) throw error;
    mode = data.value.mode === 'auto' ? 'auto' : 'review'; trials = Number(data.value.trial_issues || 0);
  }
  return <main className="panel"><Link href="/admin">← 編輯室</Link><h1>設定與啟用檢查</h1>
    {demo && <p className="status">DEMO：設定只供預覽，不會變更真實出刊。</p>}
    <PublishingSettings key={mode + ':' + trials} initialMode={mode} trialIssues={trials} demo={demo}/>
    <h2>出刊設定</h2><p>分級與版面門檻集中在 config/edition-settings.mjs；預算與模型設定放在 runner 的環境變數。密鑰不進瀏覽器。</p>
    <table><tbody>{[
      ['英文程度',editionKeys.map(e=>editions[e].cefr).join(' / ')+'，CEFR 為 Prompt 寫作目標，仍需試讀校準'],
      ['正文範圍',editionKeys.map(e=>editions[e].label+' '+editions[e].min+'–'+editions[e].max+' words').join('；')],
      ['文字模型','NVIDIA Nemotron；初始 writer/reviewer 分開請求，同一 Nano 型號，可調整'],
      ['時間','台北 06:17；07:17 補跑，GitHub 排程可能延遲'],
      ['預算','初始 2 USD 煞車。單價未設定時，金額仍未知，以 calls / tokens 上限控制'],
      ['啟用','先通過一次真正出刊與部署驗收，再設定 DD_PIPELINE_ACCEPTED；auto 另需三期試讀'],
    ].map(([key,value]) => <tr key={key}><th>{key}</th><td>{value}</td></tr>)}</tbody></table>
    <h2>來源政策</h2><p>連線成功與 robots 允許，均不等於全文或圖片已取得改寫／再使用權。</p>
    <table><thead><tr><th>來源</th><th>狀態</th><th>全文政策</th></tr></thead>
      <tbody>{sources.map(source => <tr key={source.name}><td><a href={source.terms_url} rel="noopener noreferrer" target="_blank">{source.name}</a></td>
        <td>{source.status}</td><td>{source.rewrite_policy}</td></tr>)}</tbody></table>
    <p>完整設定與復原方式見 docs/DEPLOYMENT.md、OPERATIONS.md、sources-audit.md。</p>
  </main>;
}
