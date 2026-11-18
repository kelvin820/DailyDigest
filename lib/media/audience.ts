import type {Edition} from '../../config/editions';
export const audienceImageStyles:Record<Edition,string>={
  elementary:'For elementary school readers: cheerful gentle watercolor, bright warm colors, a few large recognizable shapes, very simple composition, generous clear space, friendly and inviting. Avoid dark backgrounds, heavy shadows, dense machinery and visual clutter. School-age editorial art, not a toddler cartoon.',
  junior:'For junior high readers: clean illustrated editorial watercolor, moderate detail, clear focal point, lively but restrained colors, light background, simplified surroundings. Curious and approachable without looking childish or visually heavy.',
  senior:'For senior high readers: refined editorial watercolor, richer detail and texture, natural proportions, sophisticated muted colors and balanced visual depth. Preserve the mature newspaper illustration style.',
};
export function audienceConceptPrompt(concept:string,edition:Edition){return concept+' '+audienceImageStyles[edition]+
  ' This is a conceptual illustration, not a documentary photo or reconstruction of an actual event. No text, letters, logos or invented factual diagrams. Keep key subjects in the central area for newspaper cropping.';}
