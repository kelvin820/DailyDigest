import {storyCountOf} from '../../config/issue-settings.mjs';
import {esc} from '../render.mjs';
import {themes} from '../render.mjs';

// Chromium fills the counters after pagination, including natural continuations.
export function printPdfOptions(issue,mode='color'){
 if(storyCountOf(issue)!==4)return {};
 return {displayHeaderFooter:true,headerTemplate:'<span></span>',margin:{bottom:'8mm'},
  footerTemplate:'<div style="position:absolute;bottom:0;left:0;width:100%;height:8mm;background:'+(mode==='ink'?'#fff':themes[issue.edition].paper)+';-webkit-print-color-adjust:exact;padding:0 10mm;box-sizing:border-box;font:8px Arial,sans-serif;color:#555"><div style="border-top:0.5px solid #777;padding-top:5px;display:flex;justify-content:space-between"><span>DayDay INC. · DAILY DIGEST · '+esc(issue.issueDate)+'</span><span>R'+esc(issue.revision)+' / T'+esc(issue.templateVersion)+' · <span class="pageNumber"></span> / <span class="totalPages"></span></span></div></div>'};
}
