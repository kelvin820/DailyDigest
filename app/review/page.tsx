import {WebReviewJobs} from '../../components/WebReviewJobs';
import {readingMode} from '../../lib/reader/mode.mjs';
import {pageMember} from '../../lib/auth/server';
import Link from 'next/link';
import {publicationCatalog,reviewPackets} from '../../lib/publications/catalog';
import {benchmarkRuns} from '../../lib/editorial/benchmarks';
export const dynamic='force-dynamic';
export default async function ReviewHome(){if(readingMode()==='published')await pageMember(true);return <main className="review-room"><nav className="utility"><Link href="/">← 返回閱讀</Link><Link href="/issues">已出刊日曆</Link></nav><Link className="review-publish" href="/editor">進入網頁編輯室 →</Link><p className="eyebrow">DAYDAY EDITORIAL</p><h1>出刊審核</h1><p>先看資訊正確與否，再看趣味性、資訊性與可讀性。每篇可保留主題改寫，或選類別換題；核准前，讀者仍看到目前刊物。</p><WebReviewJobs/><section className="review-dashboard"><h2>歷史比較與重新生成</h2>{benchmarkRuns.length?benchmarkRuns.map(r=><Link className="review-card" key={r.id} href={'/review/benchmarks/'+r.id}><strong>{r.kind==='regeneration'?'單篇重新生成':'四篇新稿 · 三輪速度與品質比較'}</strong><span>{r.id}</span><small>{r.status==='partial'?'部分完成':r.status==='needs_source'?'待補來源':'待審閱'} · 尚未發布 →</small></Link>):<p>四篇新題材正在進行三輪 LLM 測量，結果完成並部署後會出現在這裡。</p>}</section><section className="review-dashboard"><h2>可供出刊審閱的版本</h2>{reviewPackets().map(p=><Link className="review-card" key={p.id} href={'/review/'+p.id}><strong>{p.issueDate} · 第 {p.revision} 版</strong><span>{p.editions[0].articles.map(a=>a.headline).join(' ／ ')}</span><small>{publicationCatalog.releases.some(r=>r.packetId===p.id)?'目前／已發布':'待審查'} →</small></Link>)}</section></main>;}
