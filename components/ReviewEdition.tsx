'use client';
import {useState} from 'react';
import {editions,editionKeys,type Edition} from '../config/editions';
import {ArticleContent} from './Article';
import type {Packet} from '../lib/publications/catalog';
import {StoryRegeneration} from './StoryRegeneration';
import type {SourceChoice} from '../lib/editorial/library';

export function ReviewEdition({packet,pdfPaths,choices}:{packet:Packet;pdfPaths:Record<string,string>;choices:SourceChoice[]}){
 const [edition,setEdition]=useState<Edition>('elementary'),[copied,setCopied]=useState(false);
 const issue=packet.editions.find(i=>i.edition===edition)!;
 return <><section className="review-version"><div><label htmlFor="packet-id">期刊 ID</label><input id="packet-id" readOnly value={packet.id}/></div><div><label htmlFor="packet-fingerprint">此版編號</label><input id="packet-fingerprint" readOnly value={packet.fingerprint}/></div><button onClick={async()=>{try{await navigator.clipboard.writeText(packet.fingerprint);setCopied(true);}catch{const field=document.getElementById('packet-fingerprint') as HTMLInputElement;field.focus();field.select();}}}>{copied?'已複製':'複製此版編號'}</button></section><section className="reading-tools" aria-label="審查版本"><div className="edition-picker">{editionKeys.map(e=><button key={e} aria-pressed={edition===e} onClick={()=>setEdition(e)}>{editions[e].label}<small>{editions[e].cefr}</small></button>)}</div><div className="downloads"><a href={pdfPaths[edition+':color']}>↓ 彩色 PDF</a><a href={pdfPaths[edition+':ink']}>省墨 PDF ↗</a></div></section><section className={'newspaper review-paper '+edition} style={{'--paper':editions[edition].paper,'--accent':editions[edition].accent} as React.CSSProperties}><div className="article-grid">{issue.articles.map(a=><article key={a.storyId} className="article"><ArticleContent article={a}/><StoryRegeneration key={a.storyId+edition} base={{kind:"packet",id:packet.id,fingerprint:packet.fingerprint}} storyId={a.storyId} category={a.category} edition={edition} choices={choices} usedStoryIds={issue.articles.map(a=>a.storyId)}/></article>)}</div></section></>;
}
