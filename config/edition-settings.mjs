// Historical V1 bounds stay fixed for previously published payloads without a snapshot.
export const v1Rules={elementary:{min:40,max:60,avg:10,maxSentence:15,cefr:'A1'},
  junior:{min:60,max:90,avg:14,maxSentence:22,cefr:'A2'},senior:{min:90,max:120,avg:18,maxSentence:28,cefr:'B1'}};
// Edit these current defaults for a NEW revision. Generation snapshots the bounds.
export const editionSettings={
  elementary:{label:'小學版',name:'Elementary',cefr:'A1',paper:'#F7E2D2',accent:'#316559',
    min:40,max:60,avg:10,sentenceMax:15,printSize:14,minPrintSize:13},
  junior:{label:'國中版',name:'Junior High',cefr:'A2',paper:'#F3DFE4',accent:'#485C8E',
    min:60,max:90,avg:14,sentenceMax:22,printSize:12.5,minPrintSize:12},
  senior:{label:'高中版',name:'Senior High',cefr:'B1',paper:'#F2D2C4',accent:'#794638',
    min:90,max:120,avg:18,sentenceMax:28,printSize:11.5,minPrintSize:11},
};
