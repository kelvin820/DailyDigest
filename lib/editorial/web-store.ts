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
export function databaseConfigured(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()&&process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());}
export function serviceDatabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!key)throw Error('DATABASE_NOT_CONFIGURED');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}});
}
export function documentStore():DocumentStore {
 const db=serviceDatabase();
 function checked(key:string){if(!key.startsWith(WEB_PREFIX))throw Error('INVALID_DOCUMENT_NAMESPACE');return key;}
 return {
  async get<T>(key:string){const {data,error}=await db.from('app_settings').select('value').eq('key',checked(key)).maybeSingle();if(error)throw Error('DATABASE_READ_FAILED');return data?.value as T??null;},
  async create(key,value){const {error}=await db.from('app_settings').insert({key:checked(key),value});if(error?.code==='23505')return false;if(error)throw Error('DATABASE_WRITE_FAILED');return true;},
  async compare(key,version,value){const {data,error}=await db.from('app_settings').update({value,updated_at:new Date().toISOString()}).eq('key',checked(key)).eq('value->>version',String(version)).select('key');if(error)throw Error('DATABASE_WRITE_FAILED');return !!data?.length;},
  async list<T>(prefix:string){const {data,error}=await db.from('app_settings').select('value').like('key',checked(prefix)+'%').order('key').limit(1000);if(error)throw Error('DATABASE_READ_FAILED');return (data||[]).map(row=>row.value as T);},
 };
}
export async function changeDocument<T extends {version:number}>(store:DocumentStore,key:string,initial:()=>T,change:(value:T)=>void):Promise<T>{
 for(let attempt=0;attempt<10;attempt++){
  const current=await store.get<T>(key),next=structuredClone(current??initial());change(next);next.version=(current?.version??0)+1;
  if(current?await store.compare(key,current.version,next):await store.create(key,next))return next;
 }
 throw Error('DATABASE_BUSY');
}
