import type {Edition} from '../../config/editions';
export const audienceImageStyles:Record<Edition,string>={
  elementary:'cheerful gentle watercolor, bright warm colors, a few large recognizable shapes, very simple composition, generous clear space, friendly and inviting. Avoid dark backgrounds, heavy shadows, dense machinery and visual clutter. School-age editorial art, not a toddler cartoon.',
  junior:'clean illustrated editorial watercolor, moderate detail, clear focal point, lively but restrained colors, light background, simplified surroundings. Curious and approachable without looking childish or visually heavy.',
  senior:'refined editorial watercolor, richer detail and texture, natural proportions, sophisticated muted colors and balanced visual depth. Preserve the mature newspaper illustration style.',
};
export function audienceConceptPrompt(concept:string,edition:Edition){return concept+' '+audienceImageStyles[edition]+
  ' This is a conceptual illustration, not a documentary photo or reconstruction of an actual event. No text, letters, logos or invented factual diagrams. Keep key subjects in the central area for newspaper cropping.';}
const topicObjects={technology:'an unbranded keyboard, a plain game controller and a blank screen on a tidy desk',culture:'a closed book and a small empty picture frame on a museum desk',nature:'green leaves beside a still pond',science:'a prism, a small telescope and a blank notebook on a desk',world:'a plain globe beside a blank notebook',business:'a small market stall with baskets and a potted plant'};
export function audienceTopicPrompt(category:keyof typeof topicObjects,edition:Edition){return audienceConceptPrompt('A simple, non-specific newspaper topic illustration of '+topicObjects[category]+'. No people, characters, brands, weapons or violence.',edition);}
