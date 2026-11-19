import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {benchmarkSchema} from '../lib/editorial/benchmarks';
import {hash} from '../lib/pipeline/state.mjs';

const directory=resolve(process.argv[2]||'output/llm-benchmark');
const raw=JSON.parse(await readFile(resolve(directory,'benchmark.json'),'utf8'));
if(!/^[a-z0-9-]{1,80}$/.test(raw.id)||raw.published!==false||raw.databaseWritten!==false)throw Error('INVALID_REVIEW_RESULT');
const base='/benchmarks/'+raw.id+'/';const staging=resolve('output/benchmark-staging',raw.id);await mkdir(staging,{recursive:true});
const pdfFiles=[];
for(const f of raw.pdfFiles){
 if(!f.noOverflow||!f.textVerified||!f.fontsEmbedded||!Number.isInteger(f.pages)||f.pages<1)throw Error('UNVERIFIED_BENCHMARK_PDF');
 const name=basename(f.path);if(!/^DD_\d{4}-\d{2}-\d{2}_(elementary|junior|senior)_r\d+_(color|ink)\.pdf$/.test(name))throw Error('INVALID_PDF_PATH');
 const input=resolve(directory,'pdf',name),bytes=await readFile(input),sha256=createHash('sha256').update(bytes).digest('hex');
 if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('INVALID_PDF_BYTES');
 await copyFile(input,resolve(staging,name));pdfFiles.push({edition:f.edition,mode:f.mode,pages:f.pages,path:base+name,sha256,qualityValidated:f.qualityValidated});
}
const body={...raw,pdfFiles,sourceRun:process.env.SOURCE_RUN_ID?Number(process.env.SOURCE_RUN_ID):null};delete body.fingerprint;
const report=benchmarkSchema.parse({...body,fingerprint:hash(body)});
const index=JSON.parse(await readFile('content/benchmarks/index.json','utf8'));
const old=index.runs.find((r:{id:string})=>r.id===report.id);if(old&&old.fingerprint!==report.fingerprint)throw Error('IMMUTABLE_BENCHMARK_CHANGED');
if(!old){
 const destination=resolve('public','.'+base);await mkdir(destination,{recursive:true});
 for(const f of pdfFiles)await copyFile(resolve(staging,basename(f.path)),resolve(destination,basename(f.path)));
 index.runs.unshift(report);await writeFile('content/benchmarks/index.json.tmp',JSON.stringify(index,null,2)+'\n');await rename('content/benchmarks/index.json.tmp','content/benchmarks/index.json');
}
console.log(JSON.stringify({id:report.id,status:report.status,reviewPage:'/review/benchmarks/'+report.id,published:false}));
