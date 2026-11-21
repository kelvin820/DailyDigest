// A manual, one-image NVIDIA smoke test. No automatic publication or retries.
export const NVIDIA_IMAGE_MODEL='black-forest-labs/flux-3-image-klein';
export const NVIDIA_IMAGE_MODELS=[NVIDIA_IMAGE_MODEL,'stabilityai/stable-diffusion-xl',
  'stabilityai/stable-diffusion-3-medium','black-forest-labs/flux.2-klein-4b'] as const;
export type NvidiaImageModel=typeof NVIDIA_IMAGE_MODELS[number];
export const SIMPLE_PARK_IMAGE_PROMPT='A watercolor painting of a public park with green trees, an empty bench and a winding path.';
export const NVIDIA_OFFICIAL_IMAGE_SAMPLE='a simple coffee shop interior';
export const PARK_IMAGE_PROMPT='Editorial watercolor illustration on warm ivory paper: an open sketchbook on a wooden outdoor table showing simple green tree shapes and curved paths for a possible future community park, colored pencils, leafy trees softly in the background. No people, no lettering, no logos. Conceptual planning scene, not a photograph or a completed real event. Sage green, muted ochre and terracotta. Keep the important sketchbook centered with generous space around it for newspaper landscape cropping.';

type ImageDiagnostic={httpStatus:number;hasArtifacts:boolean;artifactCount:number;hasProviderError:boolean;
  hasImage:boolean;finishReason:string|null;validationFields:string[];validationMessages:string[];steps:number};
export async function generateNvidiaImage(key:string,{fetcher=fetch,prompt=PARK_IMAGE_PROMPT,
  model=NVIDIA_IMAGE_MODEL,onDiagnostic,timeoutMs=180000}:{fetcher?:typeof fetch;prompt?:string;model?:NvidiaImageModel;timeoutMs?:number;
    onDiagnostic?:(diagnostic:ImageDiagnostic)=>void}={}){
  if(!key.trim())throw Error('IMAGE_KEY_MISSING');
  if(!NVIDIA_IMAGE_MODELS.includes(model))throw Error('IMAGE_MODEL_NOT_ALLOWED');
  const payload=model==='stabilityai/stable-diffusion-xl'?
    {text_prompts:[{text:prompt,weight:1}],cfg_scale:5,sampler:'K_DPM_2_ANCESTRAL',seed:18,steps:25}:
    model==='stabilityai/stable-diffusion-3-medium'?
      {prompt,cfg_scale:5,aspect_ratio:'3:2',seed:18,steps:28,negative_prompt:''}:
      model==='black-forest-labs/flux.2-klein-4b'?{prompt,width:1024,height:1024,steps:4}:
      {prompt,width:1216,height:832,steps:50};
  const response=await fetcher('https://ai.api.nvidia.com/v1/genai/'+model,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(Math.max(1000,Math.min(180000,timeoutMs))),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload),
  });
  // Never include response bodies, headers or API credentials in an error/log.
  const maxBytes=response.ok?14_000_000:64_000;
  if(!response.body||Number(response.headers.get('content-length'))>maxBytes){
    await response.body?.cancel();throw Error(response.ok?'IMAGE_RESPONSE_TOO_LARGE':'IMAGE_HTTP_'+response.status);
  }
  const parts:Uint8Array[]=[];let size=0;
  const reader=response.body.getReader();
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
    if(size>maxBytes){await reader.cancel();throw Error(response.ok?'IMAGE_RESPONSE_TOO_LARGE':'IMAGE_HTTP_'+response.status);}parts.push(chunk.value);
  }}finally{reader.releaseLock();}
  let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{
    throw Error(response.ok?'IMAGE_RESPONSE_INVALID':'IMAGE_HTTP_'+response.status);
  }
  const reason=data?.artifacts?.[0]?.finishReason??data?.finish_reason??null;
  const finishReason=reason===null?null:['SUCCESS','CONTENT_FILTERED','ERROR'].includes(reason)?reason:'UNKNOWN';
  const fields=new Set(['body','prompt','text_prompts','cfg_scale','sampler','seed','steps','width','height',
    'aspect_ratio','mode','model','negative_prompt','weight','text']);
  const validationFields=Array.isArray(data?.detail)?[...new Set<string>(data.detail.flatMap((item:{loc?:unknown[]})=>
    Array.isArray(item?.loc)?item.loc.filter((part):part is string=>typeof part==='string'&&fields.has(part)):[]))]:[];
  const validationMessages=Array.isArray(data?.detail)?data.detail.slice(0,5).flatMap((item:{msg?:unknown})=>typeof item.msg==='string'?[item.msg.split(key).join('[credential]').replace(/https?:\/\/\S+/g,'[url]').slice(0,300)]:[]):[];
  onDiagnostic?.({httpStatus:response.status,hasArtifacts:Array.isArray(data?.artifacts),
    artifactCount:Array.isArray(data?.artifacts)?data.artifacts.length:0,hasProviderError:!!(data?.error||data?.errors),
    hasImage:typeof data?.image==='string',finishReason,validationFields,validationMessages,steps:payload.steps});
  if(!response.ok)throw Error('IMAGE_HTTP_'+response.status);
  if(data?.error||data?.errors)throw Error('IMAGE_PROVIDER_REJECTED');
  if(finishReason==='CONTENT_FILTERED')throw Error('IMAGE_CONTENT_FILTERED');
  if(finishReason&&finishReason!=='SUCCESS')throw Error('IMAGE_PROVIDER_REJECTED');
  const isSd3=model==='stabilityai/stable-diffusion-3-medium';
  const raw=isSd3?data?.image:data?.artifacts?.[0]?.base64;
  const encoded=typeof raw==='string'?raw.replace(/^data:image\/(?:jpeg|png);base64,/,'').replace(/\s/g,''):raw;
  if((!isSd3&&data?.artifacts?.length!==1)||typeof encoded!=='string'||!encoded.length||
    encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('IMAGE_RESPONSE_INVALID');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length>10_000_000||!bytes.length)throw Error('IMAGE_SIZE_LIMIT');
  const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
    bytes[0]===255&&bytes[1]===216?'image/jpeg':null;
  if(!mime)throw Error('IMAGE_MIME_REJECTED');
  const seed=data?.artifacts?.[0]?.seed??data?.seed??('seed' in payload?payload.seed:undefined);
  return {bytes,mime,model,prompt,...(Number.isSafeInteger(seed)&&seed>=0?{seed}:{})};
}
