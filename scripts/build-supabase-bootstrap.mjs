import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {buildSupabaseBootstrap} from '../lib/db/bootstrap.mjs';

const result=await buildSupabaseBootstrap(process.argv[2]||process.env.DAILY_DIGEST_SUPABASE_URL||process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'');
const output=resolve(process.argv[3]||'output/DayDay_Supabase_Setup.sql');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,result.sql);
console.log(JSON.stringify({project:result.project,migrations:result.migrations,path:output,applied:false}));
