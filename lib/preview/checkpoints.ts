import {z} from 'zod';
import {hash} from '../pipeline/state.mjs';

const step=z.object({status:z.literal('success'),inputHash:z.string().regex(/^[a-f0-9]{64}$/),
  output:z.unknown(),outputHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const key=z.string().regex(/^demo-[1-8]:(elementary|junior|senior):(write|review):[0-2]$/);
export function validatedPreviewCheckpoints(value:unknown){
  const records=z.record(key,step).parse(value);
  if(Object.values(records).some(record=>hash(record.output)!==record.outputHash))throw Error('PREVIEW_CHECKPOINT_CORRUPT');
  return records;
}
