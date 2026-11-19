import type {BenchmarkDraft} from './benchmarks';
export function timingSummary(drafts:BenchmarkDraft[]){
 const fresh=drafts.filter(d=>!d.reused),values=fresh.flatMap(d=>[...(d.writerCalls?[d.writerMs]:[]),...(d.reviewerCalls?[d.reviewerMs]:[])]).sort((a,b)=>a-b);
 const percentile=(p:number)=>values.length?values[Math.max(0,Math.ceil(values.length*p)-1)]:null;
 return{writerMs:fresh.reduce((s,d)=>s+d.writerMs,0),reviewerMs:fresh.reduce((s,d)=>s+d.reviewerMs,0),medianMs:percentile(.5),p95Ms:percentile(.95),repairs:fresh.reduce((s,d)=>s+Math.max(0,d.writerCalls-1)+Math.max(0,d.reviewerCalls-1),0),tested:fresh.length};
}
