// Prepare web-sized copies of the supplied transparent artwork; originals stay in docs/reference/logos.
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
await mkdir('public/branding',{recursive:true});
const assets=[
 ['Company-Logo.png','dayday-wordmark-dark',179,745,1690,559,900],
 ['Company-Logo1.png','dayday-wordmark-light',197,755,1653,540,900],
 ['Company-Logo2.png','dayday-monogram',616,606,816,835,192],
];
for(const [original,name,left,top,width,height,size] of assets){
 const source=sharp('docs/reference/logos/'+original).extract({left,top,width,height});
 await source.clone().resize({width:size}).png().toFile('public/branding/'+name+'.png');
 if(name==='dayday-monogram')await source.clone().resize({width:64,height:64,fit:'contain',background:'#0000'}).png().toFile('app/icon.png');
}
