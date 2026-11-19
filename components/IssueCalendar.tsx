'use client';
import {useState} from 'react';
import Link from 'next/link';

export function IssueCalendar({dates,today}:{dates:string[];today:string}){
 const [month,setMonth]=useState((dates[0]||today).slice(0,7));
 const [year,number]=month.split('-').map(Number),first=new Date(Date.UTC(year,number-1,1));
 const offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const known=new Set(dates),minimum=(dates.at(-1)||today).slice(0,7),maximum=[today.slice(0,7),dates[0]?.slice(0,7)||''].sort().at(-1)!;
 function move(delta:number){const d=new Date(Date.UTC(year,number-1+delta,1));setMonth(d.toISOString().slice(0,7));}
 return <section className="issue-calendar" aria-label="已出刊日曆"><div className="calendar-heading"><button aria-label="上一個月" disabled={month<=minimum} onClick={()=>move(-1)}>←</button><h2>{year} 年 {number} 月</h2><button aria-label="下一個月" disabled={month>=maximum} onClick={()=>move(1)}>→</button></div><div className="calendar-week" aria-hidden="true">{['一','二','三','四','五','六','日'].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-days">{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:days},(_,i)=>{const day=String(i+1).padStart(2,'0'),date=month+'-'+day;return known.has(date)?<Link key={date} href={'/issues/'+date} aria-label={date+' 已出刊'} aria-current={date===today?'date':undefined}>{i+1}<span aria-hidden="true">●</span></Link>:<button key={date} disabled aria-label={date+' 尚無期刊'}>{i+1}</button>})}</div><p className="calendar-key">● 有期刊的日期可以點選</p></section>;
}
