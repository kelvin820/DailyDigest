// Read-only source audit; never fetches Git or reads environment-variable values.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const split=value=>value.split('\0').filter(Boolean);
const tracked=split(git('ls-files','-z')),working=split(git('ls-files','--cached','--others','--exclude-standard','-z'));
const auxiliary=['.runtime/latest-task-state.json','.runtime/backfill-campaign-id.txt','.runtime/backfill-status.json','.runtime/backfill-control.mjs','.runtime/editorial-maintenance.mjs','.runtime/provision-setup-token.mjs','.runtime/verify-backfill.mjs','.runtime/check-backfill-pdfs.py','.runtime/check-completed-pdfs.mjs','.runtime/merge-week-proof.mjs'].filter(path=>existsSync(resolve(root,path)));
const forbidden=path=>/(^|\/)\.git\//.test(path)||/(^|\/)(node_modules|\.next|\.vercel)\//.test(path)||/(^|\/)\.env(?!\.example$)/.test(path)||/(^|\/)(setup-token|cron-secret)\.txt$/.test(path)||/\.(pem|p12|pfx)$/i.test(path);
const paths=[...new Set([...working,...auxiliary])].sort();
const missing=[],lfsPointers=[],forbiddenPaths=[],files=[];
for(const path of paths){
 if(forbidden(path)){forbiddenPaths.push(path);continue;}
 const absolute=resolve(root,path);if(!absolute.startsWith(root+sep))throw Error('SOURCE_PATH_OUTSIDE_REPOSITORY');
 if(!existsSync(absolute)){missing.push(path);continue;}
 const stat=lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()){missing.push(path);continue;}
 const bytes=readFileSync(absolute);if(bytes.length<1024&&bytes.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1'))lfsPointers.push(path);
 files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),kind:tracked.includes(path)?'tracked':auxiliary.includes(path)?'handoff-tool':'local-source'});
}
const critical=['package.json','pnpm-lock.yaml','tsconfig.json','next.config.ts','vercel.json','app/page.tsx','app/editor/page.tsx','app/globals.css','app/api/cron/daily/route.ts','app/api/internal/pdf/route.ts','components/NewsDesk.tsx','lib/editorial/web-jobs.ts','lib/editorial/web-store.ts','lib/editorial/web-images.ts','lib/pipeline/editorial.ts','lib/providers/text.ts','lib/providers/image.ts','lib/pdf/vercel.ts','workflows/edition.ts','workflows/steps.ts','prompts/writer.v2.txt','prompts/reviewer.v1.txt','public/fonts/NotoSansTC-Print.ttf','public/fonts/OldStandard-Bold.ttf','public/fonts/PlayfairDisplay.ttf'];
const missingCritical=critical.filter(path=>!files.some(file=>file.path===path));
const staticReferences=new Set();
function visit(value){if(typeof value==='string'&&/^\/(preview-issues|fonts)\//.test(value))staticReferences.add(value.split(/[?#]/)[0]);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);}
visit(JSON.parse(readFileSync(resolve(root,'content/publications/catalog.json'),'utf8')));
const missingStaticReferences=[...staticReferences].filter(path=>!existsSync(resolve(root,'public','.'+path)));
const directories=['app','components','config','lib','workflows','prompts','supabase/migrations','public/fonts','public/preview-issues','scripts','tests','docs'];
const counts=Object.fromEntries(directories.map(path=>[path,files.filter(file=>file.path.startsWith(path+'/')).length]));
const fsck=git('fsck','--full','--no-reflogs');
let originMain=null;try{originMain=git('rev-parse','refs/remotes/origin/main').trim();}catch{/* An archive may not contain a remote-tracking ref. */}
const head=git('rev-parse','HEAD').trim(),changed=split(git('diff','--name-only','-z')),untracked=split(git('ls-files','--others','--exclude-standard','-z'));
const report={checkedAt:new Date().toISOString(),root,head,cachedOriginMain:originMain,matchesCachedOrigin:head===originMain,remoteChecked:false,node:process.version,packageManager:JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).packageManager,trackedFiles:tracked.length,includedFiles:files.length,includedBytes:files.reduce((n,f)=>n+f.bytes,0),counts,missing,missingCritical,missingStaticReferences,lfsPointers,forbiddenPaths,gitObjectsValid:true,gitFsckNotes:fsck.trim().split(/\r?\n/).filter(Boolean),changedTrackedFiles:changed,untrackedSourceFiles:untracked,auxiliaryFiles:auxiliary,complete:![missing,missingCritical,missingStaticReferences,lfsPointers,forbiddenPaths].some(items=>items.length),files};
const output=resolve(root,'output/handoff');mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'source-verification.json'),JSON.stringify(report,null,2));
writeFileSync(resolve(output,'working-tree.patch'),execFileSync('git',['diff','--binary'],{cwd:root,maxBuffer:16*1024*1024}));
console.log(JSON.stringify({complete:report.complete,head,trackedFiles:tracked.length,includedFiles:files.length,includedMiB:Math.round(report.includedBytes/1048576*10)/10,counts,missing,lfsPointers,missingCritical,missingStaticReferences,forbiddenPaths,remoteChecked:false,report:relative(root,resolve(output,'source-verification.json'))},null,2));if(!report.complete)process.exitCode=1;
