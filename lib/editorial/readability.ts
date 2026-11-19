import type {BenchmarkDraft} from './benchmarks';
export const advisoryReviewNote='Body word counts and sentence-length figures are advisory guidance. Never request a rewrite or fail an article solely because these numbers are outside the suggested range. Still assess actual CEFR difficulty, background assumptions, factual accuracy, vocabulary learning value and child suitability. Flag a long sentence only if its language actually makes comprehension unsuitable for the target audience.';
export const isLengthReminder=(message:string)=>/^字數 \d+，目標 |^句長超過目標$/.test(message);
export function advisoryDraftCheck(d:BenchmarkDraft){
 const blocking=d.errors.filter(e=>!isLengthReminder(e)),reminders=[...d.errors.filter(isLengthReminder),...(d.warnings||[])];
 const a=d.assessment;
 return{blocking,reminders,eligible:!!d.article&&blocking.length===0&&d.writerCalls===1&&d.reviewerCalls===1&&a?.factual_status==='pass'&&a.level_fit==='suitable'&&a.suitability==='pass'&&a.publish_recommendation==='pass'&&!a.issues.some(i=>i.severity!=='minor')};
}
