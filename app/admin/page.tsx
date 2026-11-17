import Link from 'next/link';
import { pageMember, demoMode, membership } from '../../lib/auth/server';
import { taipeiDate } from '../../lib/content/metrics';
import { DEMO_DATE } from '../../fixtures/issue';
import { DispatchControls,JobDetails } from '../../components/JobControls';
export const dynamic='force-dynamic';
export default async function Admin(){
  await pageMember(true);const demo=demoMode();
  let jobs:{id:string;issue_date:string;status:string;cost_status:string}[]=[];
  if(!demo){const {db}=await membership(true);const {data,error}=await db.from('generation_jobs')
    .select('id,issue_date,status,cost_status').order('created_at',{ascending:false}).limit(20);
    if(error)throw error;jobs=data||[];
  }
  const dispatchEnabled=!demo&&Boolean(process.env.GITHUB_REPOSITORY&&process.env.GITHUB_DISPATCH_TOKEN)&&process.env.DD_PIPELINE_ACCEPTED==='true';
  return <main className="panel"><Link href="/">← 返回閱讀</Link><h1>編輯室</h1>
    <nav><Link href={'/admin/issues/'+(demo?DEMO_DATE:taipeiDate())}>三版比對</Link><Link href="/admin/settings">設定與啟用檢查</Link></nav>
    <p className="status">{demo?'DEMO：沒有真實生成、審稿或發布紀錄。':'未完成的稿件不會取代已發布期刊。請查看步驟與用量，再核准或續跑。'}</p>
    {!jobs.length?<p>尚無出刊工作。</p>:jobs.map(job=><section className="revision-actions" key={job.id}>
      <h2><Link href={'/admin/issues/'+job.issue_date}>{job.issue_date}</Link></h2>
      <p>狀態：{job.status} · 費用狀態：{job.cost_status}</p><JobDetails id={job.id}/></section>)}
    <DispatchControls enabled={dispatchEnabled} issueDate={taipeiDate()}/>
  </main>;
}
