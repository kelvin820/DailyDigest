export function modelStepTimings(events:{at:string;message:string}[]){
 const groups={write:{label:'寫稿',count:0,ms:0},vocabulary:{label:'單字修訂',count:0,ms:0},review:{label:'複核',count:0,ms:0}};
 let pending:{kind:keyof typeof groups;at:number}|undefined;
 for(const e of events){
  if(e.message.startsWith('開始'))pending={kind:e.message.includes('學習單字')?'vocabulary':e.message.includes('複核')?'review':'write',at:Date.parse(e.at)};
  else if(pending&&/^完成 .+:(write|vocabulary|review):\d+$/.test(e.message)){
   const ms=Date.parse(e.at)-pending.at;if(ms>=0&&Number.isFinite(ms)){groups[pending.kind].count++;groups[pending.kind].ms+=ms;}pending=undefined;
  }
 }
 return Object.values(groups).filter(g=>g.count);
}
