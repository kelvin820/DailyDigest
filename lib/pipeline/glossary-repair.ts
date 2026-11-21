import {z} from 'zod';
import {vocabularySchema} from '../schemas/edition';
import {containsTerm} from '../content/core.mjs';
import {learningTermKey} from '../content/vocabulary.mjs';

export function glossaryRepairSchema(body:string,previous:string[]){
 const term=vocabularySchema.shape.term.refine(value=>containsTerm(body,value)&&!previous.some(old=>learningTermKey(old)===learningTermKey(value)), 'Use an exact word or phrase present in the body, without repeating an earlier edition.');
 return z.object({vocabulary:z.array(vocabularySchema.extend({term})).length(2).refine(values=>new Set(values.map(v=>learningTermKey(v.term))).size===2)}).strict();
}
