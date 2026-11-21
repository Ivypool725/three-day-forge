import { CONFIG, type Config } from '../config';
import { orders } from './orders';

export type Phase = 'letter'|'order'|'heat'|'strike'|'quench'|'inspect'|'receipt'|'threat'|'night'|'reminder'|'final'|'end';
export type Ending = 'pay'|'expose'|'arrest';
export interface GameState {
  records:{grade:string; money:number; rep:number}[]; phase:Phase; completed:number; silver:number; rep:number; paid:number;
  hits:number[]; streak:number; best:number; clues:boolean[]; chest:boolean;
  ending:Ending|"leave"|null; threatSeen:boolean;
}
export function newGame(config:Config = CONFIG):GameState {
  return { records:[], phase:'letter', completed:0, silver:0, rep:config.game.startRep, paid:0, hits:[],
    streak:0, best:0, clues:[false,false,false], chest:false, ending:null, threatSeen:false };
}
export function orderIndex(s:GameState) {
  return Math.max(0, Math.min(8, s.completed - (s.phase === 'receipt' ? 1 : 0)));
}
export function tuning(index:number) {
  const day = Math.floor(index / 3);
  return { green:index === 0 ? .20 : .145 - .022 * day, yellow:.34 - .025 * day, period:1500 - day * 180 + (index === 0 ? 220 : 0) };
}
export function mark(position:number, index:number) {
  const d = Math.abs(position - .5), t = tuning(index);
  return d <= t.green ? 2 : d <= t.yellow ? 1 : 0;
}
export function hit(s:GameState, position:number) {
  if (s.phase !== 'strike' || s.hits.length >= 3) return;
  const value=mark(position,s.completed);
  s.hits.push(value); s.streak=value === 2 ? s.streak+1 : 0; s.best=Math.max(s.best,s.streak);
  if (s.hits.length === 3) s.phase='quench';
  return value;
}
export function appraisal(hits:number[], index:number) {
  const points=hits.reduce((a,b)=>a+b,0);
  const grade=points>=5?'精良':points>=3?'合格':'瑕疵';
  return { grade, points, money:orders[index].max*(points>=5?10:points>=3?8:5), rep:points>=5?3:points>=3?2:-3 };
}
export function deliver(s:GameState) {
  if(s.phase!=='inspect' || s.completed>=orders.length || s.hits.length!==3) return;
  const a=appraisal(s.hits,s.completed);
  (s.records??=[]).push({grade:a.grade,money:a.money,rep:a.rep});
  s.silver+=a.money; s.rep+=a.rep; s.completed++; s.phase='receipt';
}
export function advanceReceipt(s:GameState) {
  if(s.phase!=='receipt')return;
  const next:Partial<Record<number,Phase>>={3:'threat',4:'reminder',6:'night',9:'final'};
  s.phase=next[s.completed]??'order'; s.hits=[];
}
export function available(s:GameState,id:number) {
  return id===0?s.threatSeen:id===1?s.completed>=6||(s.completed===5 && s.phase==='order'):id===2 && s.completed>=7 && s.chest;
}
export function collect(s:GameState,id:number) {
  if(available(s,id) && s.phase!=='end') s.clues[id]=true;
}
export function choices(s:GameState):Ending[] {
  const list:Ending[]=[];
  if(s.silver>=CONFIG.game.demand)list.push('pay');
  if(s.rep>=CONFIG.game.witnessRep && s.clues.every(Boolean))list.push('expose');
  return list.length?list:['arrest'];
}
export function finish(s:GameState,e:Ending) {
  if(s.phase!=='final'||!choices(s).includes(e))return;
  if(e==='pay'){s.paid=CONFIG.game.demand; s.silver-=s.paid;}
  s.ending=e; s.phase='end';
}
export const money=(v:number)=>String(v/10);
