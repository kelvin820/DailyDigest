import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readingMode} from '../../../../lib/reader/mode.mjs';
import {pageMember} from '../../../../lib/auth/server';
import {benchmarkById,type BenchmarkDraft} from '../../../../lib/editorial/benchmarks';
import {sourceChoices} from '../../../../lib/editorial/library';
import {packetById} from '../../../../lib/publications/catalog';
import {BenchmarkReview} from '../../../../components/BenchmarkReview';
export const dynamic='force-dynamic';
export default async function BenchmarkPage({params}:{params:Promise<{id:string}>}){
 if(readingMode()==='published')await pageMember(true);
 const {id}=await params,report=benchmarkById(id);if(!report)notFound();
 let previous:BenchmarkDraft[]|undefined;
 if(report.request){const b=report.request.base;if(b.kind==='benchmark')previous=benchmarkById(b.id)?.rounds.find(r=>r.number===b.round)?.drafts;else previous=packetById(b.id)?.editions.flatMap(i=>i.articles.map(a=>({storyId:a.storyId,edition:i.edition,article:a,writerMs:0,reviewerMs:0,writerCalls:0,reviewerCalls:0,assessment:null,errors:[],firstPass:false,reused:true})));}
 return <main className="review-room"><nav className="utility"><Link href="/">← 返回閱讀</Link><Link href="/review">所有審核版本</Link></nav><header><p className="eyebrow">DAYDAY EDITORIAL</p><h1>{report.kind==='regeneration'?'單篇重新生成':'四篇新稿 · 速度與品質比較'}</h1><p>{report.issueDate} · {report.model}</p><p className="review-status">{report.status==='partial'?'部分完成 · 待審閱':report.status==='needs_source'?'待補來源':'待審閱'} · 尚未發布</p></header><section className="review-summary"><h2>這裡由你決定是否值得刊登</h2><p>字數與句長採建議值，不為數字自動重寫。除了事實、難度與單字，請比較趣味性、資訊性與可讀性。每篇下方可以填評語，同題重寫或選類別換題；舊稿與目前首頁均會保留。</p><p>這次共 {report.totalCalls} 次 API 請求、{report.totalTokens.toLocaleString()} tokens，費用未取得可確認的單價。{report.kind!=='regeneration'&&'三輪保留模型原稿，沒有人工修稿或按內容反覆重寫。'}</p>{report.errorCode&&<p className="draft-error">未完成項目：{report.errorCode}。已完成的結果保留如下。</p>}</section><BenchmarkReview report={report} choices={sourceChoices(report.issueDate)} previous={previous}/><details className="review-records"><summary>四篇來源底稿與限制</summary><p>來源摘錄經開發時閱讀核對；請透過連結再核對原文與時間。頁面沒有把示範資料當成實際出刊。</p>{report.facts.map(f=><section key={f.story_id}><h2>{f.story_id}</h2>{f.sources.map(s=><p key={s.source_id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.publisher} ↗</a> · {s.published_at.slice(0,s.published_at_precision==='month'?7:10)}</p>)}{report.sourceLabels.find(s=>s.storyId===f.story_id)?.label&&<p>{report.sourceLabels.find(s=>s.storyId===f.story_id)!.label}</p>}{f.claims.map(c=><p key={c.claim_id}>{c.must_keep?'必要事實':'可選細節'}：{c.text}</p>)}{f.uncertainties.map((u,i)=><p key={i}>{u}</p>)}</section>)}</details><p className="review-help">比較稿不會直接換到首頁。完成來源、文字、圖片與 PDF 的正式檢查後，仍需你審閱核准。</p></main>;
}
