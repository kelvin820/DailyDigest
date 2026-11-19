import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {esc,renderArticle} from '../lib/render.mjs';
import {renderReviewReader} from '../lib/preview/reader.mjs';
import {vocabularyOverlapErrors} from '../lib/content/vocabulary.mjs';
const directory=resolve(process.argv[2]||'output/daily-production-trial');
const issues=JSON.parse(await readFile(resolve(directory,'editions.json'),'utf8'));
const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
if(report.status!=='review_copy_ready'||vocabularyOverlapErrors(issues).length)throw Error('TRIAL_NOT_READY');
const labels={elementary:'小學版 · A1',junior:'國中版 · A2',senior:'高中版 · B1'};
const css=(await readFile('app/globals.css','utf8')).replaceAll('/fonts/','fonts/');
let html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Digest · 三版對照</title><style>${css}
.review-home{max-width:1360px;margin:auto;padding:28px 20px;font-family:'DD Sans','DD CJK',sans-serif;background:#fbf8f1;color:#24241f}.review-home h1{font-family:'DD Serif',serif;font-size:36px}.review-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:22px 0 50px}.review-grid .article{padding:18px;background:var(--paper);border-top:3px solid var(--accent)}.review-grid .body-copy{font-size:16px}.review-grid figure{margin:18px 0}.review-grid .asset-visual{aspect-ratio:3/2}.review-grid .asset-visual img{width:100%;height:100%;object-fit:cover}.review-grid h2{font-size:24px}.review-home p{line-height:1.7}.review-banner{padding:14px;border:1px solid #a57a43}.review-home a{color:inherit}.review-home .vocab{font-size:14px}@media(max-width:800px){.review-grid{grid-template-columns:1fr}.review-home h1{font-size:30px}}
</style><body><main class="review-home"><p>DAYDAY DAILY DIGEST · ${esc(report.issueDate)}</p><h1>同一則新聞，三種閱讀程度</h1><p class="review-banner"><b>試閱刊</b> 本期尚未正式發布。<br>每天四則故事，依程度選讀適合自己的版本。</p><p>${issues.map(i=>`<a href="${i.edition}.html">閱讀${labels[i.edition]}</a>`).join(' · ')}</p>`;
for(const base of issues[0].articles){html+=`<h2>第 ${base.order} 篇 · ${esc(base.sources[0].publisher)}</h2><section class="review-grid">`;
 for(const issue of issues){const a=issue.articles.find(a=>a.storyId===base.storyId);html+=`<article class="article ${issue.edition}" style="--paper:${{elementary:'#F7E2D2',junior:'#F3DFE4',senior:'#F2D2C4'}[issue.edition]};--accent:#485c67"><p><b>${labels[issue.edition]}</b> · ${a.wordCount} 字</p>${renderArticle(a).replaceAll('<details>','<details open>')}</article>`;}
 html+='</section>';
}
html+=`<details><summary>編輯紀錄</summary><p>${report.editorialReviewRequired?'本期仍有 '+report.editorialReviewHolds.length+' 篇待編輯確認。':''}來源與審閱細節：<a href="report.json">製作紀錄</a> · <a href="reviews.json">原始審稿結果</a>。本期尚未寫入正式資料庫或正式發布。</p></details></main><script src="media-fallback.js" defer></script></body></html>`;
await writeFile(resolve(directory,'compare.html'),html);
for(const issue of issues)await writeFile(resolve(directory,issue.edition+'.html'),renderReviewReader(issue,{css,pdfAvailable:report.pdfVerified}));
console.log('Built actual-response audience and vocabulary comparison.');
