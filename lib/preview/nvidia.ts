import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {editionKeys,editions} from '../../config/editions';
import {articleSchema,type EditionView} from '../schemas/edition';
import {factSchema,writerSchema} from '../schemas/editorial';
import {stats} from '../content/metrics';
import {hash} from '../pipeline/state.mjs';
import {esc,renderArticle} from '../render.mjs';

export const PREVIEW_ISSUE_DATE='2026-11-17';
export type PreviewFact=z.infer<typeof factSchema>;
export type PreviewEdition=Omit<EditionView,'articles'> & {articles:EditionView['articles']};
type Step={status:string;output:unknown;outputHash:string};
export type PreviewReport={status:string;generatedAt:string;model:string;modelRequestAttempts:number;
  modelResponsesWithUsage:number;usageUnknownAttempts:number;inputTokens:number;outputTokens:number;
  costStatus:string;estimatedUsd:number|null;errorCode:string|null;pdfVerified:boolean;published:false};

export function previewFacts(input:unknown):PreviewFact[]{
  const rows=z.array(z.array(z.string()).length(11)).length(8).parse(input);
  const timestamp=PREVIEW_ISSUE_DATE+'T00:00:00Z';
  return rows.map((row,index)=>factSchema.parse({story_id:'demo-'+(index+1),event_key:'owned-fiction-'+(index+1),
    primary_category:row[0],content_kind:index>=6?'knowledge':'news',published_at:timestamp,
    event_date:null,is_demo:true,sensitivity:'low',uncertainties:['This is a fictional scenario, not a real news report.'],
    sources:[{source_id:'dayday-fiction',url:'https://example.org/demo-only',publisher:'DayDay original fictional scenario',
      published_at:timestamp,retrieved_at:timestamp,read_at:timestamp,rights_reviewed:true,
      independence_group:'dayday-owned-fiction',evidence:row.slice(2,5).join(' ')}],
    claims:row.slice(2,5).map((text,i)=>({claim_id:'claim-'+(i+1),text,supporting_source_ids:['dayday-fiction'],
      evidence_ref:'dayday-fiction',status:'reported',must_keep:i===0})),
  }));
}

// Actual successful writer responses remain inspectable if later review/PDF gates fail.
// No predefined article body is used as a substitute for a missing model response.
export function partialPreview(records:Record<string,unknown>,facts:PreviewFact[]):PreviewEdition[]{
  return editionKeys.map(edition=>{
    const articles:EditionView['articles']=[];
    for(const [index,fact]of facts.entries()){
      for(let attempt=2;attempt>=0;attempt--){
        const raw=records[`${fact.story_id}:${edition}:write:${attempt}`] as Step|undefined;
        if(!raw||raw.status!=='success')continue;
        if(hash(raw.output)!==raw.outputHash)throw Error('PREVIEW_CHECKPOINT_CORRUPT');
        const parsed=writerSchema.safeParse((raw.output as {data?:unknown})?.data);
        if(!parsed.success)continue;
        const data=parsed.data;
        articles.push(articleSchema.parse({storyId:fact.story_id,order:index+1,category:fact.primary_category,
          contentKind:fact.content_kind,headline:data.headline,bodyParagraphs:data.body_paragraphs,
          wordCount:stats(data.body_paragraphs.join(' ')).count,vocabulary:data.vocabulary,
          image:{assetId:fact.primary_category,alt:'Original category illustration',caption:'Original category illustration',
            kind:'icon',credit:'DayDay original artwork'},
          sources:fact.sources.map(s=>({publisher:s.publisher,url:s.url,publishedAt:s.published_at})),eventDate:null}));
        break;
      }
    }
    const c=editions[edition];
    return{schemaVersion:'1.0',issueDate:PREVIEW_ISSUE_DATE,revision:1,edition,targetCefr:c.cefr,
      templateVersion:'1.0',publishedAt:null,isDemo:true,articles};
  });
}

export function previewHtml(issue:PreviewEdition,report:PreviewReport,css:string){
  const c=editions[issue.edition];
  const label=report.modelResponsesWithUsage===0?'API 尚未取得生成回應':report.status==='comparison_drafts'?'API 單篇三版比較 · DEMO':report.status==='generated_demo'?'API 試生成 · DEMO':'API 草稿 · 尚未通過全部驗證';
  const provenance=report.modelResponsesWithUsage===0?'尚未取得可用的 NVIDIA 生成回應；不會以預設樣刊代替模型結果。':'自有虛構底稿，由 NVIDIA API 試寫；不是真實新聞，尚未出刊。';
  const generatedAt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'}).format(new Date(report.generatedAt))+'（台北）';
  const pdf=report.pdfVerified?['color','ink'].map(mode=>`<a href="DD_${issue.issueDate}_${issue.edition}_r1_${mode}.pdf">${mode==='color'?'彩色 PDF':'省墨 PDF'}</a>`).join(' · '):'PDF 尚未通過驗證';
  return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>NVIDIA 試生成 · '+esc(c.label)+' · DayDay</title><style>'+css.replaceAll('/fonts/','fonts/')+
    '.preview-meta{font-size:12px;line-height:1.8;padding:18px 0}.preview-meta code{overflow-wrap:anywhere}.preview-review{font-size:12px;line-height:1.6;padding:16px 0}.preview-review pre{white-space:pre-wrap;overflow-wrap:anywhere}.preview-tabs{display:flex;gap:16px;flex-wrap:wrap;padding:16px 0}.preview-tabs a[aria-current=page]{font-weight:bold}.preview-error{padding:12px;border:1px solid #9a352a;color:#9a352a;overflow-wrap:anywhere}</style><body>'+ 
    `<main class="newspaper ${issue.edition}" style="--paper:${c.paper};--accent:${c.accent}"><nav class="preview-tabs" aria-label="版本比較">`+
    editionKeys.map(e=>`<a href="${e}.html"${e===issue.edition?' aria-current="page"':''}>${esc(editions[e].label)} · ${editions[e].cefr}</a>`).join('')+
    '</nav><header class="masthead"><div class="masthead-top"><span>THE WORLD, A LITTLE EVERY DAY.</span><span>NVIDIA · DEVELOPER PREVIEW</span></div><h1>'+
    (issue.edition==='senior'?'DAILY DIGEST':'<span class="masthead-wordmark">DAILY DIGEST</span>')+'<span>by DayDay</span></h1>'+ 
    `<div class="dateline"><span>FICTIONAL SCENARIO / ${issue.issueDate}</span><span>GENERATION PREVIEW</span><span>${esc(c.name.toUpperCase())}</span></div></header>`+
    `<div class="notice"><b>${label}</b>${provenance}</div>`+
    `<div class="preview-meta">模型：<code>${esc(report.model)}</code><br>產生時間：${esc(generatedAt)}<br>`+
    `請求 ${report.modelRequestAttempts} 次；取得 usage 的回應 ${report.modelResponsesWithUsage} 次；另有 ${report.usageUnknownAttempts} 次用量未確認。<br>`+
    `已回報 tokens：輸入 ${report.inputTokens}／輸出 ${report.outputTokens}；成本狀態：${esc(report.costStatus)}（${report.estimatedUsd===null?'金額未確認':esc(report.estimatedUsd)+' USD 估計'}）。<br>`+
    `${pdf} · <a href="report.json">驗證與用量</a> · <a href="checkpoints.json">實際寫稿／複核回應</a></div>`+
    (report.errorCode?`<p class="preview-error">未完成：${esc(report.errorCode)}。以下保留已收到的實際草稿，不以預設樣刊補齊。</p>`:'')+
    `<section class="article-grid">${issue.articles.map(article=>'<article class="article">'+renderArticle(article)+
      `<p class="preview-review">正文 ${article.wordCount} 字 · 目標 ${c.min}–${c.max} 字 · ${report.status==='generated_demo'?'寫稿與複核門檻已通過，仍待人工校準':'開發草稿，未取得整期通過結果'}</p></article>`).join('')}</section>`+
    (!issue.articles.length?'<p class="preview-error">此版本尚未取得可顯示的模型草稿。</p>':'')+
    '<footer><b>DayDay INC.</b><span>真實 API 試生成，不代表真實出刊；CEFR 為目標難度。</span></footer></main></body></html>';
}

export async function writePreviewReaders(directory:string,issues:PreviewEdition[],report:PreviewReport){
  const css=await readFile('app/globals.css','utf8');
  await mkdir(resolve(directory,'fonts'),{recursive:true});
  for(const file of ['NotoSans-Regular.ttf','Newsreader.ttf','NotoSansTC.ttf','LibreCaslonText.ttf',
    'OldStandard-Bold.ttf','PlayfairDisplay.ttf','OFL.txt','Newsreader.ttf.license.txt','NotoSansTC.ttf.license.txt',
    'LibreCaslonText-OFL.txt','oldstandardtt-OFL.txt','playfairdisplay-OFL.txt']){
    await copyFile(resolve('public/fonts',file),resolve(directory,'fonts',file));
  }
  for(const issue of issues)await writeFile(resolve(directory,issue.edition+'.html'),previewHtml(issue,report,css));
  await writeFile(resolve(directory,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=elementary.html"><a href="elementary.html">開啟 NVIDIA 試生成</a>');
}

export function previewError(error:unknown){
  const message=error instanceof Error?error.message:'';
  return /^(?:MODEL_[A-Z0-9_]+|PDF_[A-Z_]+|COMPARISON_INCOMPLETE|BUDGET_EXCEEDED|NVIDIA_KEY_REQUIRED|PREVIEW_SECRET_IN_OUTPUT|WRITER_[A-Z_]+|CLAIM_ALLOWLIST_FAILED|REVIEW_CLAIM_ALLOWLIST_FAILED|NEEDS_REVIEW:[A-Za-z0-9_-]+:(?:elementary|junior|senior))$/.test(message)?message:'PREVIEW_FAILED';
}
