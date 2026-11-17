import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMember, demoMode, membership } from '../../../../lib/auth/server';
import { demoIssue, DEMO_DATE } from '../../../../fixtures/issue';
import { editionKeys, editions } from '../../../../config/editions';
import { editionSchema, type EditionView } from '../../../../lib/schemas/edition';
import { validDate } from '../../../../lib/content/metrics';
import { RevisionActions } from '../../../../components/RevisionActions';

export const dynamic = 'force-dynamic';
export default async function Review({ params }: { params: Promise<{ date: string }> }) {
  await pageMember(true);
  const { date } = await params;
  if (!validDate(date)) notFound();
  const demo = demoMode();
  if (demo && date !== DEMO_DATE) notFound();
  let payloads: EditionView[] = demo ? editionKeys.map(demoIssue) : [];
  let report: unknown = { mode: 'demo', pass: false, reason: '尚未執行真實審稿' };
  let revision = { id: '', fingerprint: '', status: 'demo', canApprove: false };
  let reviews: unknown = [];
  let facts: unknown = [];
  if (!demo) {
    const { db } = await membership(true);
    const { data: issue, error } = await db.from('issues').select('id').eq('issue_date', date).maybeSingle();
    if (error) throw error;
    if (issue) {
      const { data: row, error: revisionError } = await db.from('issue_revisions')
        .select('id').eq('issue_id', issue.id).order('revision_no', { ascending: false }).limit(1).maybeSingle();
      if (revisionError) throw revisionError;
      if (row) {
        const { data, error: readError } = await db.rpc('admin_revision', { target: row.id });
        if (readError) throw readError;
        payloads = data.payloads.map((p: unknown) => editionSchema.parse(p));
        report = data.gate_report; reviews = data.reviews; facts = data.facts;
        revision = { id: data.id, fingerprint: data.fingerprint, status: data.status,
          canApprove: data.status === 'ready' && data.gate_report?.pass === true && data.gate_report?.mode === 'live' };
      }
    }
  }
  return <main className="panel">
    <Link href="/admin">← 編輯室</Link><h1>三版比對 · {date}</h1>
    {!payloads.length ? <p>這一天尚無稿件。上一期已發布內容仍可閱讀。</p> : <>
      <RevisionActions key={revision.id} {...revision} payloads={payloads} demo={demo}/>
      <details open><summary>發布檢查與問題列表</summary><pre className="review-report">{JSON.stringify(report, null, 2)}</pre></details>
      <details><summary>各版審稿紀錄</summary><pre className="review-report">{JSON.stringify(reviews, null, 2)}</pre></details>
      <details><summary>共同事實底稿與來源證據（僅管理員）</summary><pre className="review-report">{JSON.stringify(facts, null, 2)}</pre></details>
      <div className="admin-stories">{payloads.map(p => <section key={p.edition}>
        <h2>{editions[p.edition].label} / {p.targetCefr}</h2>
        {p.articles.map(a => <article key={a.storyId}>
          <h3>{a.order}. {a.headline}</h3>{a.bodyParagraphs.map((para, i) => <p key={i} lang="en">{para}</p>)}
          <small>{a.wordCount} words · {a.storyId}</small>
          {a.correctionNote && <p>更正：{a.correctionNote}</p>}
          {a.sources.map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.publisher}</a></p>)}
        </article>)}
      </section>)}</div>
    </>}
  </main>;
}
