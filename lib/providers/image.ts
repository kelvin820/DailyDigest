// A manual, one-image NVIDIA smoke test. No automatic publication or retries.
export const NVIDIA_IMAGE_MODEL='black-forest-labs/flux.1-schnell';
export const PARK_IMAGE_PROMPT='Editorial watercolor illustration on warm ivory paper: an open sketchbook on a wooden outdoor table showing simple green tree shapes and curved paths for a possible future community park, colored pencils, leafy trees softly in the background. No people, no lettering, no logos. Conceptual planning scene, not a photograph or a completed real event. Sage green, muted ochre and terracotta. Keep the important sketchbook centered with generous space around it for newspaper landscape cropping.';

export async function generateNvidiaImage(key:string,{fetcher=fetch,prompt=PARK_IMAGE_PROMPT}={}){
  if(!key.trim())throw Error('IMAGE_KEY_MISSING');
  const response=await fetcher('https://ai.api.nvidia.com/v1/genai/'+NVIDIA_IMAGE_MODEL,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(180_000),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
    // Hosted endpoint's current sample accepts prompt, dimensions and steps only.
    // Its reference schema also lists fields that the hosted gateway rejects (422).
    body:JSON.stringify({prompt,width:1216,height:832,steps:4}),
  });
  // Never include response bodies, headers or API credentials in an error/log.
  if(!response.ok){await response.body?.cancel();throw Error('IMAGE_HTTP_'+response.status);}
  if(!response.body||Number(response.headers.get('content-length'))>14_000_000)throw Error('IMAGE_RESPONSE_TOO_LARGE');
  const parts:Uint8Array[]=[];let size=0;
  const reader=response.body.getReader();
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;
    if(size>14_000_000){await reader.cancel();throw Error('IMAGE_RESPONSE_TOO_LARGE');}parts.push(chunk.value);
  }}finally{reader.releaseLock();}
  let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('IMAGE_RESPONSE_INVALID');}
  const encoded=data?.artifacts?.[0]?.base64;
  if(data?.artifacts?.length!==1||typeof encoded!=='string'||!encoded.length||
    encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('IMAGE_RESPONSE_INVALID');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length>10_000_000||!bytes.length)throw Error('IMAGE_SIZE_LIMIT');
  const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
    bytes[0]===255&&bytes[1]===216?'image/jpeg':null;
  if(!mime)throw Error('IMAGE_MIME_REJECTED');
  return {bytes,mime,model:NVIDIA_IMAGE_MODEL,prompt};
}
