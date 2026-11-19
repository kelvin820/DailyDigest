import {z} from 'zod';
import {hash} from '../pipeline/state.mjs';

const step=z.object({status:z.literal('success'),inputHash:z.string().regex(/^[a-f0-9]{64}$/),
  output:z.unknown(),outputHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const key=z.string().regex(/^[A-Za-z0-9_-]{1,100}:(elementary|junior|senior):(write|review|accepted|vocabulary):[0-2]$/);
export function validatedPreviewCheckpoints(value:unknown){
  const records=z.record(key,step).parse(value);
  if(Object.values(records).some(record=>hash(record.output)!==record.outputHash))throw Error('PREVIEW_CHECKPOINT_CORRUPT');
  return records;
}
