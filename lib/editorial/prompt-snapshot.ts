import {editions} from '../../config/editions';
import {hash} from '../pipeline/state.mjs';

export type PromptSnapshot={writer:string;reviewer:string};
export const promptExecutionHash=(prompts:PromptSnapshot)=>hash({prompts,editions,contract:'vercel-web-editorial-v1'});

// Recover the exact original bytes, so existing paid checkpoints keep their hashes.
export function resolvePromptSnapshot(expected:string,current:PromptSnapshot,snapshot?:PromptSnapshot):PromptSnapshot{
 if(snapshot&&promptExecutionHash(snapshot)===expected)return snapshot;
 const variants=(s:string)=>{const lf=s.replace(/\r\n/g,'\n');return [lf,lf.replaceAll('\n','\r\n')];};
 for(const writer of variants(current.writer))for(const reviewer of variants(current.reviewer)){
  const candidate={writer,reviewer};if(promptExecutionHash(candidate)===expected)return candidate;
 }
 throw Error('GENERATION_PROMPTS_CHANGED');
}
