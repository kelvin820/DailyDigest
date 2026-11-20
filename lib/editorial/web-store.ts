import {createClient} from '@supabase/supabase-js';

// Reuse the installed, RLS-protected document table. Only the server service
// role accesses this namespace; browser clients receive no database credentials.
export const WEB_PREFIX='dayday:web:v1:';
export interface DocumentStore {
 get<T>(key:string):Promise<T|null>;
 create<T extends {version:number}>(key:string,value:T):Promise<boolean>;
 compare<T extends {version:number}>(key:string,version:number,value:T):Promise<boolean>;
 list<T>(prefix:string):Promise<T[]>;
}
function databaseError(error:{code?:string;message?:string},status?:number){
 if(error.code==='42501')return Error('DATABASE_PERMISSION_DENIED');
 if(status===401||status===403||['PGRST301','PGRST302'].includes(error.code||''))return Error('DATABASE_AUTH_FAILED');
 if(['PGRST205','42P01','42703'].includes(error.code||''))return Error('DATABASE_SCHEMA_MISSING');
 if(status===0||/fetch failed|network|timeout/i.test(error.message||''))return Error('DATABASE_UNREACHABLE');
 return Error('DATABASE_READ_FAILED');
}
export function databaseConfiguration(env:Record<string,string|undefined>=process.env){
 const prefixedUrl=env.DAILY_DIGEST_SUPABASE_URL?.trim(),prefixedKey=env.DAILY_DIGEST_SUPABASE_SECRET_KEY?.trim();
 // The newly connected resource uses the DAILY_DIGEST prefix. Never combine
 // its URL or key with the older unprefixed integration still in the project.
 if(prefixedUrl||prefixedKey)return {url:prefixedUrl,key:prefixedKey,source:'marketplace' as const};
 const marketplaceKey=env.SUPABASE_SECRET_KEY?.trim();
 return marketplaceKey?{url:env.SUPABASE_URL?.trim(),key:marketplaceKey,source:'marketplace' as const}:
  {url:env.NEXT_PUBLIC_SUPABASE_URL?.trim()||env.SUPABASE_URL?.trim(),key:env.SUPABASE_SERVICE_ROLE_KEY?.trim(),source:'legacy' as const};
}
export function databaseConfigured(){const {url,key}=databaseConfiguration();return !!(url&&key);}
export function isServiceKey(key:string){
 if(key.startsWith('sb_secret_'))return true;
 try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{return false;}
}
export function serviceFetch(key:string,fetcher:typeof fetch=fetch):typeof fetch {
 return (input,init)=>{
  const headers=new Headers(init?.headers);
  // Opaque API keys belong in apikey, never in a JWT Bearer header. Preserve
  // legacy service_role JWT behavior and any distinct actual session token.
  if(key.startsWith('sb_secret_')&&headers.get('authorization')==='Bearer '+key)headers.delete('authorization');
  return fetcher(input,{...init,headers,signal:AbortSignal.timeout(20000)});
 };
}
export function serviceDatabase(){
 const {url,key}=databaseConfiguration();
 if(!url||!key)throw Error('DATABASE_NOT_CONFIGURED');
 if(!isServiceKey(key))throw Error('DATABASE_NOT_SERVICE_KEY');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:serviceFetch(key)}});
}
export function documentStore():DocumentStore {
 const db=serviceDatabase();
 function checked(key:string){if(!key.startsWith(WEB_PREFIX))throw Error('INVALID_DOCUMENT_NAMESPACE');return key;}
 return {
  async get<T>(key:string){const {data,error,status}=await db.from('app_settings').select('value').eq('key',checked(key)).maybeSingle();if(error)throw databaseError(error,status);return data?.value as T??null;},
  async create(key,value){const {error}=await db.from('app_settings').insert({key:checked(key),value});if(error?.code==='23505')return false;if(error)throw Error('DATABASE_WRITE_FAILED');return true;},
  async compare(key,version,value){const {data,error}=await db.from('app_settings').update({value,updated_at:new Date().toISOString()}).eq('key',checked(key)).eq('value->>version',String(version)).select('key');if(error)throw Error('DATABASE_WRITE_FAILED');return !!data?.length;},
  async list<T>(prefix:string){const {data,error,status}=await db.from('app_settings').select('value').like('key',checked(prefix)+'%').order('key').limit(1000);if(error)throw databaseError(error,status);return (data||[]).map(row=>row.value as T);},
 };
}
export async function changeDocument<T extends {version:number}>(store:DocumentStore,key:string,initial:()=>T,change:(value:T)=>void):Promise<T>{
 for(let attempt=0;attempt<10;attempt++){
  const current=await store.get<T>(key),next=structuredClone(current??initial());change(next);next.version=(current?.version??0)+1;
  if(current?await store.compare(key,current.version,next):await store.create(key,next))return next;
 }
 throw Error('DATABASE_BUSY');
}
