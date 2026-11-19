import {mastheadTrials} from './masthead-catalog.js';

const byId=id=>mastheadTrials.find(font=>font.id===id);
const bounded=(value,min,max,fallback)=>{const n=Number(value);return value!==null&&value!==''&&Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};
const storageKey='dd-masthead-trial-v1';
let saved={};
try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');if(value&&typeof value==='object')saved=value;}catch{/* Preview remains usable without storage. */}
const query=new URLSearchParams(location.search);
const candidate=byId(query.get('font'))||byId(saved.font)||byId('c');
const initial=query.has('font')?Object.fromEntries(query):saved;
const state={font:candidate.id,paper:['junior','senior','white'].includes(initial.paper)?initial.paper:'junior',weight:bounded(initial.weight,candidate.min,candidate.max,candidate.weight),width:bounded(initial.width,70,110,candidate.width),tracking:bounded(initial.tracking,-70,50,candidate.tracking)};
const $=id=>document.getElementById(id);
const fontChoice=$('font-choice'),weight=$('font-weight'),width=$('font-width'),tracking=$('font-tracking');
function styleLine(line,font,settings){line.style.fontFamily=`"${font.family}",serif`;line.style.fontWeight=String(settings.weight);line.style.letterSpacing=(settings.tracking/1000)+'em';line.style.transform=`scaleX(${settings.width/100})`;line.dataset.scale=String(settings.width/100);}
function fitLines(){document.querySelectorAll('.type-line').forEach(line=>{if(!line.getClientRects().length)return;line.style.fontSize='';const stage=line.parentElement;const natural=line.scrollWidth*Number(line.dataset.scale||1);const base=parseFloat(getComputedStyle(stage).fontSize);if(natural>stage.clientWidth-12)line.style.fontSize=(base*(stage.clientWidth-12)/natural)+'px';});}
function choose(font){state.font=font.id;state.weight=font.weight;state.width=font.width;state.tracking=font.tracking;render();}
for(const font of mastheadTrials){
  const option=document.createElement('option');option.value=font.id;option.textContent=font.label+' · '+font.name;fontChoice.append(option);
  const card=document.createElement('button');card.type='button';card.className='font-card';card.dataset.font=font.id;card.setAttribute('aria-label',font.label+' · '+font.name+'，放大比較');
  const label=document.createElement('span');label.className='card-label';const letter=document.createElement('b');letter.textContent=font.label;const name=document.createElement('span');name.textContent=font.name;label.append(letter,name);
  const paper=document.createElement('div');paper.className='card-paper';const stage=document.createElement('div');stage.className='title-stage card-stage';const line=document.createElement('span');line.className='type-line';line.textContent='DAILY DIGEST';styleLine(line,font,font);stage.append(line);const signature=document.createElement('p');signature.className='card-signature';signature.textContent='by DayDay';paper.append(stage,signature);
  const note=document.createElement('span');note.className='card-note';note.textContent=font.description;const action=document.createElement('span');action.className='card-action';action.textContent='放大比較 ↗';card.append(label,paper,note,action);card.addEventListener('click',()=>choose(font));$(font.previous?'previous-fonts':'font-grid').append(card);
}
function render(){
  const font=byId(state.font);fontChoice.value=font.id;weight.min=String(font.min);weight.max=String(font.max);weight.disabled=font.min===font.max;weight.value=String(state.weight);width.value=String(state.width);tracking.value=String(state.tracking);
  $('weight-value').textContent=String(state.weight);$('width-value').textContent=state.width+'%';$('tracking-value').textContent=(state.tracking/1000).toFixed(3)+' em';$('weight-hint').textContent=weight.disabled?'這款只有此字重':`${font.min}–${font.max}，可調整筆畫厚度`;
  const colors={junior:['#F3DFE4','#485C8E','JUNIOR HIGH','國中紙色'],senior:['#F2D2C4','#794638','SENIOR HIGH','高中紙色'],white:['#fffdf7','#485C8E','TYPE COMPARISON','白紙比較']}[state.paper];
  document.documentElement.style.setProperty('--paper',colors[0]);document.documentElement.style.setProperty('--accent',colors[1]);$('paper-label').textContent=colors[2];
  document.querySelectorAll('[data-paper]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.paper===state.paper)));
  document.querySelectorAll('.font-card').forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.font===state.font)));
  styleLine($('hero-title'),font,state);
  $('selection').textContent=`${font.label} · ${font.name}｜字重 ${state.weight}｜字寬 ${state.width}%｜字距 ${(state.tracking/1000).toFixed(3)} em｜${colors[3]}`;
  try{localStorage.setItem(storageKey,JSON.stringify(state));$('save-note').textContent='選擇已保留在這台裝置，也已更新目前網址。';}catch{$('save-note').textContent='無法寫入本機儲存；仍可比較，也可保留目前網址。';}
  try{const url=new URL(location.href);for(const [key,value]of Object.entries(state))url.searchParams.set(key,String(value));history.replaceState(null,'',url);}catch{/* Selection remains usable without URL updates. */}
  requestAnimationFrame(fitLines);
}
fontChoice.addEventListener('change',()=>choose(byId(fontChoice.value)));
weight.addEventListener('input',()=>{state.weight=Number(weight.value);render();});width.addEventListener('input',()=>{state.width=Number(width.value);render();});tracking.addEventListener('input',()=>{state.tracking=Number(tracking.value);render();});
document.querySelectorAll('[data-paper]').forEach(button=>button.addEventListener('click',()=>{state.paper=button.dataset.paper;render();}));
$('reset-trial').addEventListener('click',()=>choose(byId(state.font)));
$('trial-controls').addEventListener('submit',event=>event.preventDefault());
$('copy-choice').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('selection').textContent);$('save-note').textContent='已複製，貼回對話就能記下這組選擇。';}catch{$('save-note').textContent='請直接選取並複製上方的選擇描述。';}});
window.addEventListener('resize',fitLines);document.fonts.addEventListener('loadingdone',fitLines);
document.querySelector('.previous').addEventListener('toggle',()=>{fitLines();document.fonts.ready.then(fitLines);});
render();document.fonts.ready.then(fitLines);
