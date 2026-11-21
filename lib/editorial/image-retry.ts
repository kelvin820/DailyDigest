export function imageFailureCode(error:unknown){
 const e=error as {name?:string;message?:string};
 if(e?.name==='TimeoutError'||e?.name==='AbortError')return 'IMAGE_TIMEOUT';
 return typeof e?.message==='string'&&/^[A-Z_0-9]+$/.test(e.message)?e.message:'IMAGE_FAILED';
}
export const retryableImageError=(code:string)=>/^(IMAGE_TIMEOUT|IMAGE_FAILED|IMAGE_STORAGE_FAILED|IMAGE_HTTP_(429|5\d\d))$/.test(code);
