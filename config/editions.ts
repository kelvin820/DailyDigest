export const editions={elementary:{label:"小學版",name:"Elementary",cefr:"A1",paper:"#F7E2D2",accent:"#316559",min:40,max:60,avg:10,sentenceMax:15,printSize:14,minPrintSize:13},junior:{label:"國中版",name:"Junior High",cefr:"A2",paper:"#F3DFE4",accent:"#485C8E",min:60,max:90,avg:14,sentenceMax:22,printSize:12.5,minPrintSize:12},senior:{label:"高中版",name:"Senior High",cefr:"B1",paper:"#F2D2C4",accent:"#794638",min:90,max:120,avg:18,sentenceMax:28,printSize:11.5,minPrintSize:11}} as const;
export type Edition=keyof typeof editions;
export const editionKeys=Object.keys(editions) as Edition[];
export function editionOf(value:unknown):Edition{return typeof value==="string"&&value in editions?value as Edition:"elementary"}
export const categories={world:"World & Politics",business:"Business",technology:"Technology",culture:"Culture",nature:"Nature",science:"Science"} as const;
