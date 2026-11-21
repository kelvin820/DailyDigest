import {changeDocument,type DocumentStore} from './web-store';
type ImageLedger={version:number;slots:string[];rejectedSlots?:string[]};
export async function reserveImageSlot(store:DocumentStore,key:string,slot:string,limit:number,backfill:boolean,topic=false){
 await changeDocument<ImageLedger>(store,key,()=>({version:0,slots:[]}),v=>{
  if(topic){
   if(!v.slots.includes(slot))throw Error('IMAGE_REJECTION_NOT_RECORDED');
   v.rejectedSlots??=[];
   if(!v.rejectedSlots.includes(slot)){
    const prefix=slot.split(':')[0]+':';
    if(v.rejectedSlots.filter(s=>s.startsWith(prefix)).length>=12||backfill&&v.rejectedSlots.length>=84)throw Error('IMAGE_TOPIC_RETRY_LIMIT');
    v.rejectedSlots.push(slot);
   }
  }
  const target=slot+(topic?':topic':'');if(v.slots.includes(target))throw Error('IMAGE_ALREADY_ATTEMPTED');
  if(v.slots.length>=limit)throw Error('IMAGE_BUDGET_EXCEEDED');
  v.slots.push(target);
 });
}
