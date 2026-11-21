export type ImageFailure={model:string;code:string};
export class ImagePriorityError extends Error{constructor(public failures:ImageFailure[]){super(failures.at(-1)?.code||'IMAGE_NO_PROVIDER');}}
export async function generateWithImagePriority<T>(models:{id:string;run:()=>Promise<T>}[],onFailure:(failure:ImageFailure)=>Promise<void>|void=()=>{}){
 if(!models.length||models.length>3||new Set(models.map(m=>m.id)).size!==models.length)throw Error('IMAGE_PRIORITY_CONFIG');
 const failures:ImageFailure[]=[];
 for(const model of models){
  try{return {model:model.id,result:await model.run(),failures};}catch(error){
   const e=error as {name?:string;message?:string},code=e?.name==='TimeoutError'||e?.name==='AbortError'?'IMAGE_TIMEOUT':e?.message&&/^[A-Z_0-9]+$/.test(e.message)?e.message:'IMAGE_FAILED';
   const failure={model:model.id,code};failures.push(failure);await onFailure(failure);
   if(!/^(IMAGE_CONTENT_FILTERED|IMAGE_TIMEOUT|IMAGE_FAILED|IMAGE_HTTP_(404|422|429|5\d\d))$/.test(code))throw new ImagePriorityError(failures);
  }
 }
 throw new ImagePriorityError(failures);
}
