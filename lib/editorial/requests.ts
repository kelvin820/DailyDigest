import {z} from 'zod';

export const editorialCategories={politics:'政治／公民',science:'科學',culture:'文化',games:'遊戲',local:'地方',nature:'自然',technology:'科技',world:'國際',business:'商業'} as const;
export type EditorialCategory=keyof typeof editorialCategories;
export const regenerationRequestSchema=z.object({
 version:z.literal(1),
 base:z.object({kind:z.enum(['packet','benchmark']),id:z.string().regex(/^[a-z0-9-]{1,80}$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),round:z.number().int().min(1).max(3).optional()}).strict(),
 storyId:z.string().min(1).max(100),
 mode:z.enum(['rewrite','replace']),
 category:z.enum(['politics','science','culture','games','local','nature','technology','world','business']),
 replacementFactId:z.string().max(100).optional(),
 editions:z.array(z.enum(['elementary','junior','senior'])).min(1).max(3).refine(v=>new Set(v).size===v.length),
 direction:z.string().trim().min(1).max(1200),
 ratings:z.object({interest:z.number().int().min(1).max(5).optional(),information:z.number().int().min(1).max(5).optional(),readability:z.number().int().min(1).max(5).optional()}).strict().optional(),
}).strict().superRefine((r,c)=>{
 if(r.mode==='replace'&&r.editions.length!==3)c.addIssue({code:'custom',message:'換題必須同步三個程度，保持相同事件。'});
 if(r.mode==='replace'&&!r.replacementFactId)c.addIssue({code:'custom',message:'指定類別換題需要已核對來源的候選故事。'});
 if(r.base.kind==='benchmark'&&!r.base.round)c.addIssue({code:'custom',message:'請選擇比較輪次。'});
});
export type RegenerationRequest=z.infer<typeof regenerationRequestSchema>;
