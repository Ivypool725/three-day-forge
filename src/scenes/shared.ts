import manifest from '../../assets/manifest.json';
import { urlOf } from '../engine/assets';
export const ui=document.querySelector<HTMLElement>('#ui')!;
export const dialog=document.querySelector<HTMLDialogElement>('#folio')!;
export function art(id:string,cls:string,alt='') {
  const path=(manifest.images as Record<string,string>)[id];
  if(!path)return '';
  return '<img draggable="false" class="'+cls+'" alt="'+alt+'" src="'+urlOf(path)+'">';
}
export function button(action:string,label:string,style='primary') {
  return '<button type="button" class="'+style+'" data-act="'+action+'">'+label+'</button>';
}
export function panel(eyebrow:string,title:string,text:string,actions:string,extra='') {
  return '<article class="sheet"><div class="meta">'+eyebrow+'</div><h1>'+title+'</h1>'+extra+'<p class="copy">'+text+'</p><div class="actions">'+actions+'</div></article>';
}
export function popup(title:string,content:string,actions='') {
  dialog.innerHTML='<div class="meta">青溪县 · 随身手记</div><h2 id="folio-title">'+title+'</h2>'+content+'<div class="actions">'+actions+button('close','合上','quiet')+'</div>';
  if(!dialog.open)dialog.showModal();
}
export const seal='<span class="seal" aria-hidden="true">周記</span>';
export function identity(){return '<div class="identity">'+seal+'<span>城西铁匠铺</span></div>';}
