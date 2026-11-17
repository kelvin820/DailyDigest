import {editionSettings} from './edition-settings.mjs';
type EditionSettings={label:string;name:string;cefr:'A1'|'A2'|'B1'|'B2';paper:string;accent:string;min:number;max:number;avg:number;sentenceMax:number;printSize:number;minPrintSize:number};
export const editions=editionSettings as Record<'elementary'|'junior'|'senior',EditionSettings>;
export type Edition=keyof typeof editions;
export const editionKeys=Object.keys(editions) as Edition[];
export function editionOf(value:unknown):Edition{return typeof value==="string"&&Object.hasOwn(editions,value)?value as Edition:"elementary"}
export const categories={world:"World & Politics",business:"Business",technology:"Technology",culture:"Culture",nature:"Nature",science:"Science"} as const;
