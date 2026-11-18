import {CompatibleProvider,type BudgetPort,type GenerationRequest} from './text';

export const GOOGLE_TEXT_MODELS=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-2.5-flash'] as const;
export const GOOGLE_IMAGE_MODELS=['gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3.1-flash-lite-image'] as const;
export type GoogleImageModel=typeof GOOGLE_IMAGE_MODELS[number];
export class GoogleProvider extends CompatibleProvider{
  constructor(key:string,budget:BudgetPort){
    super('https://generativelanguage.googleapis.com/v1beta/openai',key,budget,
      {responseFormat:'json_object',reasoningEffort:'low'});
  }
  override generateStructured<T>(input:GenerationRequest<T>){
    // Gemini's completion limit includes thinking; reserve and account that space too.
    return super.generateStructured({...input,maxOutputTokens:input.maxOutputTokens+1024});
  }
}

async function googleJson(response:Response){
  const max=response.ok?14_000_000:64_000;
  if(!response.body||Number(response.headers.get('content-length'))>max){
    await response.body?.cancel();throw Error('GOOGLE_RESPONSE_TOO_LARGE');
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;
    if(size>max){await reader.cancel();throw Error('GOOGLE_RESPONSE_TOO_LARGE');}chunks.push(part.value);
  }}finally{reader.releaseLock();}
  let raw;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{
    throw Error(response.ok?'GOOGLE_RESPONSE_INVALID':'GOOGLE_HTTP_'+response.status);
  }
  if(!response.ok){
    const status=['RESOURCE_EXHAUSTED','PERMISSION_DENIED','INVALID_ARGUMENT','UNAUTHENTICATED','NOT_FOUND',
      'FAILED_PRECONDITION','UNAVAILABLE'].includes(raw?.error?.status)?'_'+raw.error.status:'';
    throw Error('GOOGLE_HTTP_'+response.status+status);
  }
  return raw;
}

export async function listGoogleModels(key:string,fetcher:typeof fetch=fetch){
  if(!key.trim())throw Error('GOOGLE_KEY_MISSING');
  const names:string[]=[];let pageToken:string|undefined;
  for(let page=0;page<5;page++){
    const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const raw=await googleJson(await fetcher(url,{redirect:'error',headers:{'x-goog-api-key':key},
      signal:AbortSignal.timeout(20_000)}));
    if(!Array.isArray(raw.models))throw Error('GOOGLE_CATALOG_INVALID');
    for(const model of raw.models)if(typeof model.name==='string')names.push(model.name.replace(/^models\//,''));
    if(!raw.nextPageToken)return names;
    if(typeof raw.nextPageToken!=='string'||raw.nextPageToken.length>4000)throw Error('GOOGLE_CATALOG_INVALID');
    pageToken=raw.nextPageToken;
  }
  throw Error('GOOGLE_CATALOG_PAGE_LIMIT');
}

export async function generateGoogleImage(key:string,model:GoogleImageModel,prompt:string,fetcher:typeof fetch=fetch){
  if(!key.trim())throw Error('GOOGLE_KEY_MISSING');
  if(!GOOGLE_IMAGE_MODELS.includes(model))throw Error('GOOGLE_IMAGE_MODEL_NOT_ALLOWED');
  const modern=model==='gemini-nano-banana-2.1';
  const url=modern?'https://generativelanguage.googleapis.com/v1beta/interactions':
    'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent';
  const body=modern?{model,input:[{type:'text',text:prompt}]}:
    {contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],
      imageConfig:{aspectRatio:'3:2',imageSize:'1K'}}};
  // Exactly one image request, no automatic retries and no provider fallback.
  const raw=await googleJson(await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180_000),
    headers:{'x-goog-api-key':key,'Content-Type':'application/json',...(modern?{'Api-Revision':'2026-05-20'}:{})},
    body:JSON.stringify(body)}));
  type Part={type?:string;data?:string;mime_type?:string;thought?:boolean;inlineData?:{data?:string;mimeType?:string}};
  const parts:Part[]=modern?[
    ...(Array.isArray(raw.outputs)?raw.outputs:[]),
    ...(Array.isArray(raw.steps)?raw.steps.flatMap((step:{type?:string;content?:Part[];outputs?:Part[]})=>
      step.type==='model_output'?[...(Array.isArray(step.content)?step.content:[]),...(Array.isArray(step.outputs)?step.outputs:[])]:[]):[]),
  ]:raw.candidates?.[0]?.content?.parts||[];
  const images=parts.filter(p=>!p.thought&&(modern?p.type==='image'&&typeof p.data==='string':p.inlineData?.data));
  if(images.length!==1)throw Error(images.length?'GOOGLE_IMAGE_COUNT_INVALID':'GOOGLE_IMAGE_NOT_RETURNED');
  const image=images[0],encoded=modern?image.data:image.inlineData?.data;
  const mime=modern?image.mime_type:image.inlineData?.mimeType;
  if(!['image/png','image/jpeg','image/webp'].includes(mime||'')||typeof encoded!=='string'||
    !encoded.length||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('GOOGLE_IMAGE_INVALID');
  const bytes=Buffer.from(encoded,'base64');
  if(!bytes.length||bytes.length>10_000_000)throw Error('GOOGLE_IMAGE_SIZE_LIMIT');
  const usage=modern?raw.usage:raw.usageMetadata;
  const number=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
  return {bytes,mime:mime!,model,prompt,
    usage:{inputTokens:number(modern?usage?.total_input_tokens:usage?.promptTokenCount),
      outputTokens:number(modern?usage?.total_output_tokens:usage?.candidatesTokenCount)},
    requestId:typeof raw.id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(raw.id)?raw.id:undefined};
}
