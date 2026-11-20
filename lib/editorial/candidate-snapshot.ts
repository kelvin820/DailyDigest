import {hash} from '../pipeline/state.mjs';
import type {NewsCandidate} from './news-config';

export function restoreCandidateSnapshot(candidate:NewsCandidate,inputHash:string,snapshots:NewsCandidate[]){
 if(hash(candidate)===inputHash)return candidate;
 const prior=snapshots.find(c=>hash(c)===inputHash);
 const identity=(c:NewsCandidate)=>({id:c.id,url:c.url,sourceId:c.sourceId,publisher:c.publisher,publishedAt:c.publishedAt});
 if(!prior||hash(identity(prior))!==hash(identity(candidate)))throw Error('CHECKPOINT_CHANGED');
 return structuredClone(prior);
}
