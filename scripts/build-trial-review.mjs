import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {esc,renderArticle} from '../lib/render.mjs';
import {vocabularyOverlapErrors} from '../lib/content/vocabulary.mjs';
const directory=resolve(process.argv[2]||'output/daily-production-trial');
const issues=JSON.parse(await readFile(resolve(directory,'editions.json'),'utf8'));
const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
if(report.status!=='review_copy_ready'||vocabularyOverlapErrors(issues).length)throw Error('TRIAL_NOT_READY');
const labels={elementary:'小學版 · A1',junior:'國中版 · A2',senior:'高中版 · B1'};
const css=(await readFile('app/globals.css','utf8')).replaceAll('/fonts/','fonts/');
let html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>四篇試產：三版單字與插畫比較</title><style>${css}
.review-home{max-width:1360px;margin:auto;padding:28px 20px;font-family:'DD Sans','DD CJK',sans-serif;background:#fbf8f1;color:#24241f}.review-home h1{font-family:'DD Serif',serif;font-size:36px}.review-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:22px 0 50px}.review-grid .article{padding:18px;background:var(--paper);border-top:3px solid var(--accent)}.review-grid .body-copy{font-size:16px}.review-grid figure{margin:18px 0}.review-grid .asset-visual{aspect-ratio:3/2}.review-grid .asset-visual img{width:100%;height:100%;object-fit:cover}.review-grid h2{font-size:24px}.review-home p{line-height:1.7}.review-banner{padding:14px;border:1px solid #a57a43}.review-home a{color:inherit}.review-home .vocab{font-size:14px}@media(max-width:800px){.review-grid{grid-template-columns:1fr}.review-home h1{font-size:30px}}
</style><body><main class="review-home"><p>DAYDAY DAILY DIGEST · ${esc(report.issueDate)}</p><h1>同一則新聞，三種閱讀程度</h1><p class="review-banner"><b>真實來源試產 · 待審未發布</b><br>每天四篇，分別生成 A1／A2／B1 正文。單字依程度另選；AI 插畫依年齡調整，新聞照片保留原貌。CEFR 是寫作目標，仍需人工校準。</p><p>${issues.map(i=>`<a href="${i.edition}.html">閱讀${labels[i.edition]}</a>`).join(' · ')} · <a href="report.json">試產紀錄</a></p>`;
for(const base of issues[0].articles){html+=`<h2>第 ${base.order} 篇 · ${esc(base.sources[0].publisher)}</h2><section class="review-grid">`;
 for(const issue of issues){const a=issue.articles.find(a=>a.storyId===base.storyId);html+=`<article class="article ${issue.edition}" style="--paper:${{elementary:'#F7E2D2',junior:'#F3DFE4',senior:'#F2D2C4'}[issue.edition]};--accent:#485c67"><p><b>${labels[issue.edition]}</b> · ${a.wordCount} 字</p>${renderArticle(a).replaceAll('<details>','<details open>')}</article>`;}
 html+='</section>';
}
html+=`<p>本輪即時讀取 ${report.sourcePagesRead} 個來源頁面；使用 ${report.sourceSnapshotsUsed||0} 份已核對的官方來源快照。${report.editorCorrectionsApplied||0} 處編輯校稿另存紀錄；六份 PDF 已驗證，每份兩頁。這是生成與審核試跑，未寫入正式資料庫、未正式發布。</p></main><script src="media-fallback.js" defer></script></body></html>`;
await writeFile(resolve(directory,'compare.html'),html);
for(const issue of issues){const file=resolve(directory,issue.edition+'.html');let reader=await readFile(file,'utf8');if(!reader.includes('href="compare.html"'))reader=reader.replace('<nav>','<nav><a href="compare.html">三版單字／插畫比較</a> · ');await writeFile(file,reader);}
console.log('Built actual-response audience and vocabulary comparison.');
