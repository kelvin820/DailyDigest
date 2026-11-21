import {NVIDIA_IMAGE_MODELS,type NvidiaImageModel} from './image';
export function imageModelPriority(configured=process.env.NVIDIA_IMAGE_MODEL_PRIORITY,primary=process.env.NVIDIA_IMAGE_MODEL||'black-forest-labs/flux.2-klein-4b'){
 const models=(configured?.trim()?configured.split(',').map(m=>m.trim()):[primary]);
 if(!models.length||models.length>3||new Set(models).size!==models.length||models.some(m=>!NVIDIA_IMAGE_MODELS.includes(m as NvidiaImageModel)))throw Error('IMAGE_PRIORITY_CONFIG');
 return models as NvidiaImageModel[];
}
