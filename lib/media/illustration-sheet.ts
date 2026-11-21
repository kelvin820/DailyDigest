import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {audienceImageStyles} from './audience';
export const illustrationPanels=['elementary','junior','senior','adult_study'] as const;
export const adultNewspaperStyle='pure black ink on white paper, classic newspaper pen-and-ink engraving, precise crosshatching and stippling, mature editorial composition, no color or continuous gray washes';
export function illustrationSheetPrompt(concept:string){return [
 'Create one square contact sheet with FOUR equal-height HORIZONTAL panoramic illustrations stacked top to bottom. Each panel fills exactly one quarter of the canvas height and the full width. No gutters, borders, text, labels, numbers or watermarks. Never let objects cross between panels. Every panel independently depicts this same conceptual subject: '+concept,
 'TOP / elementary: '+audienceImageStyles.elementary,
 'SECOND / junior high: '+audienceImageStyles.junior,
 'THIRD / senior high: '+audienceImageStyles.senior,
 'BOTTOM / adult style study: '+adultNewspaperStyle,
 'Keep a consistent publication identity, but make the age progression and final monochrome style distinct. Each panel is a complete wide newspaper image. These are conceptual illustrations, not event photographs or factual diagrams.',
 ].join('\n');}
export function compactIllustrationSheetPrompt(subject:string){
 const prefix='Create one square contact sheet: FOUR equal horizontal strips, top to bottom, each full width and 1/4 height. No borders, gutters, text, labels or subjects crossing strips. All depict: ',suffix='\nTOP elementary: cheerful simple warm watercolor, few large shapes, friendly for school children.\nSECOND junior: clean lively editorial watercolor, moderate detail, light background, not childish.\nTHIRD senior: refined editorial watercolor, richer texture, natural proportions, muted colors.\nBOTTOM adult study: pure black ink on white, newspaper engraving, crosshatching and stippling, no color.\nEach strip is a complete conceptual illustration, not an event photograph.';
 const available=800-prefix.length-suffix.length;if(subject.length>available)throw Error('IMAGE_SHEET_SUBJECT_TOO_LONG');return prefix+subject+suffix;
}
export async function cropIllustrationSheet(bytes:Buffer){
 const normalized=await sharp(bytes,{limitInputPixels:40_000_000,animated:false}).rotate().flatten({background:'#fff'}).png().toBuffer({resolveWithObject:true});
 const {width,height}=normalized.info;if(width<800||height<640||Math.abs(width/height-1)>.05)throw Error('IMAGE_SHEET_GEOMETRY');
 const result=[];const seen=new Set<string>();
 for(const [index,key]of illustrationPanels.entries()){
  const top=Math.floor(height*index/4)+2,bottom=Math.floor(height*(index+1)/4)-2;
  let panel=sharp(normalized.data).extract({left:0,top,width,height:bottom-top});
  if(key==='adult_study')panel=panel.grayscale().threshold(170);
  const output=await panel.png().toBuffer({resolveWithObject:true}),stats=await sharp(output.data).stats();
  if(stats.channels.slice(0,3).every(c=>c.stdev<2))throw Error('IMAGE_SHEET_EMPTY_PANEL');
  const digest=createHash('sha256').update(output.data).digest('hex');if(seen.has(digest))throw Error('IMAGE_SHEET_DUPLICATE_PANEL');seen.add(digest);
  result.push({key,bytes:output.data,width:output.info.width,height:output.info.height,crop:{left:0,top,width,height:bottom-top},sha256:digest});
 }
 return result;
}
