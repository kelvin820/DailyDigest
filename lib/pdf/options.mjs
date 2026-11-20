import {storyCountOf} from '../../config/issue-settings.mjs';
import {esc} from '../render.mjs';

// Chromium fills the counters after pagination, including natural continuations.
export function printPdfOptions(issue){
 if(storyCountOf(issue)!==4)return {};
 return {displayHeaderFooter:true,headerTemplate:'<span></span>',margin:{bottom:'8mm'},
  footerTemplate:'<div style="width:100%;padding:0 8mm;box-sizing:border-box;font:8px Arial,sans-serif;color:#555"><div style="border-top:0.5px solid #777;padding-top:5px;display:flex;justify-content:space-between"><span>DayDay INC. · DAILY DIGEST · '+esc(issue.issueDate)+'</span><span>R'+esc(issue.revision)+' / T'+esc(issue.templateVersion)+' · <span class="pageNumber"></span> / <span class="totalPages"></span></span></div></div>'};
}
