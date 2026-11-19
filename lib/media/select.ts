import {assetRecordSchema,type AssetRecord} from './prepare';
import {articleSchema,type ArticleView} from '../schemas/edition';
import {taipeiDate} from '../content/core.mjs';

type Image=ArticleView['image'];
export type ImageCandidate={id:string;relevant:boolean;matchesEvent?:boolean;record:unknown};
export type ImageStory={storyId:string;category:ArticleView['category'];illustrationUseful:boolean;
  conceptSafe:boolean;candidates:ImageCandidate[]};
export type ImageSelection={storyId:string;image:Image;reason:string;generationAttempted:boolean;
  notes:{candidateId:string;code:string}[]};
const priority={event_photo:0,file_photo:1,illustration:2,generated_illustration:3};

function usableImage(value:unknown,record?:AssetRecord){
  const image=articleSchema.shape.image.parse(value);
  if(image.kind==='icon'||!image.rendition||!/^[a-f0-9]{64}$/.test(image.assetId)||
    image.rendition.webPath!==`assets/${image.assetId}-web.webp`||
    image.rendition.printPath!==`assets/${image.assetId}-print.jpg`)throw Error('IMAGE_RENDITION_REQUIRED');
  if(record&&(image.kind!==record.kind||image.credit!==record.credit||
    image.licenseUrl!==record.licenseUrl||image.sourcePage!==record.sourcePage))throw Error('IMAGE_PROVENANCE_MISMATCH');
  return image;
}

/** Resolve once per story before applying images to all reading levels.
 * Loading means validated decode/re-encode or a verified stored asset, never a hotlink.
 * A generator requires the caller's atomic daily reservation; missing wiring fails to icons.
 */
export async function selectIssueImages({stories,loadCandidate,generateConcept,reserveGeneration,
  maxGeneratedImages=2,now=new Date()}:{stories:ImageStory[];
  loadCandidate:(candidate:ImageCandidate,record:AssetRecord)=>Promise<unknown>;
  generateConcept?:(story:ImageStory)=>Promise<{record:unknown;image:unknown}>;
  reserveGeneration?:(request:{day:string;storyId:string;limit:number})=>Promise<boolean>;
  maxGeneratedImages?:number;now?:Date;
}):Promise<ImageSelection[]>{
  if(!stories.length||stories.length>8||new Set(stories.map(s=>s.storyId)).size!==stories.length||
    !Number.isInteger(maxGeneratedImages)||maxGeneratedImages<0||maxGeneratedImages>8)throw Error('IMAGE_SELECTION_INPUT_INVALID');
  let attempts=0;const selections:ImageSelection[]=[];
  for(const story of stories){
    const notes:ImageSelection['notes']=[];
    const candidates=story.candidates.flatMap(candidate=>{
      const record=assetRecordSchema.safeParse(candidate.record);
      if(!candidate.relevant||!record.success||record.data.kind==='event_photo'&&!candidate.matchesEvent){
        notes.push({candidateId:candidate.id,code:'IMAGE_NOT_ELIGIBLE'});return [];
      }
      return [{candidate,record:record.data}];
    }).sort((a,b)=>priority[a.record.kind]-priority[b.record.kind]);
    let chosen:Image|undefined,reason='icon',generationAttempted=false;
    for(const {candidate,record}of candidates){
      try{chosen=usableImage(await loadCandidate(candidate,record),record);reason='existing_'+record.kind;break;}
      catch{notes.push({candidateId:candidate.id,code:'IMAGE_LOAD_OR_VALIDATION_FAILED'});}
    }
    // Having any suitable, authorized and usable asset returns before the generation gate.
    if(!chosen){
      if(!story.illustrationUseful||!story.conceptSafe)reason='icon_concept_not_suitable';
      else if(!generateConcept)reason='icon_generator_unavailable';
      else if(attempts>=maxGeneratedImages)reason='icon_generation_limit';
      else if(!reserveGeneration)reason='icon_daily_budget_unavailable';
      else{
        let reserved=false;
        try{reserved=await reserveGeneration({day:taipeiDate(now),storyId:story.storyId,limit:maxGeneratedImages});}
        catch{/* An unavailable shared budget cannot authorize generation. */}
        if(!reserved)reason='icon_daily_budget_refused';
        else{
          attempts++;generationAttempted=true;
          try{
            const result=await generateConcept(story),record=assetRecordSchema.parse(result.record);
            if(record.kind!=='generated_illustration')throw Error('GENERATED_CONCEPT_REQUIRED');
            chosen=usableImage(result.image,record);reason='generated_missing_image';
          }catch{reason='icon_generation_failed';}
        }
      }
    }
    selections.push({storyId:story.storyId,image:chosen||{assetId:story.category,alt:story.category+' original category icon',
      caption:'Original category icon',kind:'icon',credit:'DayDay original artwork'},reason,generationAttempted,notes});
  }
  return selections;
}

export function shareSelectedImages<T extends {edition:string;articles:ArticleView[]}>(editions:T[],selections:ImageSelection[]):T[]{
  if(editions.length!==3||new Set(editions.map(e=>e.edition)).size!==3)throw Error('THREE_IMAGE_EDITIONS_REQUIRED');
  const byStory=new Map(selections.map(s=>[s.storyId,s.image]));
  if(byStory.size!==selections.length||editions.some(e=>e.articles.length!==byStory.size||
    new Set(e.articles.map(a=>a.storyId)).size!==byStory.size||e.articles.some(a=>!byStory.has(a.storyId))))throw Error('IMAGE_STORY_SET_MISMATCH');
  return editions.map(issue=>({...issue,articles:issue.articles.map(article=>({...article,
    image:structuredClone(byStory.get(article.storyId)!)}))}));
}

/** Apply a separate reviewed image selection per audience, preserving article text and photo provenance. */
export function applyAudienceImages<T extends {edition:string;articles:ArticleView[]}>(issues:T[],selections:Partial<Record<string,ImageSelection[]>>):T[]{
  if(issues.length!==3||new Set(issues.map(i=>i.edition)).size!==3)throw Error('THREE_IMAGE_EDITIONS_REQUIRED');
  const order=issues[0].articles.map(a=>a.storyId);
  return issues.map(issue=>{
    if(JSON.stringify(issue.articles.map(a=>a.storyId))!==JSON.stringify(order))throw Error('IMAGE_STORY_SET_MISMATCH');
    const selected=selections[issue.edition];if(!selected)throw Error('AUDIENCE_IMAGE_SELECTION_REQUIRED');
    const byStory=new Map(selected.map(s=>[s.storyId,articleSchema.shape.image.parse(s.image)]));
    if(selected.length!==order.length||byStory.size!==order.length||order.some(id=>!byStory.has(id)))throw Error('IMAGE_STORY_SET_MISMATCH');
    return{...issue,articles:issue.articles.map(a=>({...a,image:structuredClone(byStory.get(a.storyId)!)}))};
  });
}
