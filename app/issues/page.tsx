import Link from 'next/link';
import {listIssues} from '../../lib/db/issues';
import {pageMember,demoMode} from '../../lib/auth/server';
import {taipeiDate} from '../../lib/content/metrics';
import {IssueCalendar} from '../../components/IssueCalendar';
export const dynamic='force-dynamic';
export default async function Archive(){
 await pageMember();const issues=await listIssues();
 if(demoMode())return <main className="panel"><Link href="/">← 返回閱讀</Link><h1>The archive</h1><p>虛構樣刊</p>{issues.map(i=><p key={i.issue_date}><Link href={'/issues/'+i.issue_date}>{i.issue_date} · 三種閱讀版本 · 樣刊</Link></p>)}</main>;
 const dates=issues.map(i=>i.issue_date);
 return <main className="archive-room"><nav className="utility"><Link href="/">← 返回閱讀</Link><span>DAYDAY ARCHIVE</span></nav><h1>已出刊</h1><p>選一個日期，重新讀那一天的世界。</p><div className="archive-layout"><IssueCalendar dates={dates} today={taipeiDate()}/><section className="archive-list" aria-label="期刊清單"><h2>所有期刊</h2>{dates.length?dates.map((date,i)=><Link key={date} href={'/issues/'+date}><span>{date}</span><small>{i===0?'最新一期 · ':''}三種閱讀版本</small><span aria-hidden="true">↗</span></Link>):<p>目前尚無已出刊期刊。<Link href="/">閱讀試閱刊 →</Link></p>}</section></div></main>;
}
