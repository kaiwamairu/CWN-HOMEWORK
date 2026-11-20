'use client';
import {useEffect,useRef,useState} from 'react';
import type {Principal} from '../server/security/policy';
import {ROLE_LABELS} from '../lib/roles';
import {endSession} from '../lib/logout';
export function ProfileMenu({actor}:{actor:Principal}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const container=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 const close=()=>{setOpen(false);button.current?.focus();};
 const logout=async()=>{setBusy(true);setError('');try{await endSession();window.location.assign('/login');}catch{setError('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');setBusy(false);}};
 const first=Array.from(actor.name)[0]??'บ';
 return <div ref={container} className="profile" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}if(open&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]')??[]);const index=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}>
 <button ref={button} type="button" className="profile-trigger" aria-label={'เปิดเมนูบัญชี '+first+' '+ROLE_LABELS[actor.role]+' เทศบาลนครตัวอย่าง'} aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setOpen(true);requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus());}}}>
 <span className="profile-avatar" aria-hidden="true">{first}</span>{' '}<span className="profile-label"><span data-testid="user-role" data-role={actor.role} data-dept={actor.dept??undefined}>{ROLE_LABELS[actor.role]}</span>{' '}<small>เทศบาลนครตัวอย่าง</small></span><span aria-hidden="true" className="profile-chevron">⌃</span></button>
 <div ref={menu} id="account-menu" className="profile-menu" role="menu" aria-label="บัญชีของฉัน" hidden={!open}>
 <div className="account-info"><span>บัญชีของฉัน</span><strong data-testid="user-name">{actor.name}</strong>{actor.username&&<small>{actor.username}</small>}</div>
 {error&&<p className="field-error" role="alert" data-testid="action-error">{error}</p>}
 <button type="button" role="menuitem" className="menu-item" onClick={close}>ปิดเมนูบัญชี</button><button type="button" role="menuitem" className="menu-item logout" data-testid="logout-btn" disabled={busy} onClick={()=>void logout()}>{busy?'กำลังออกจากระบบ…':'ออกจากระบบ'}</button>
 </div></div>;
}
