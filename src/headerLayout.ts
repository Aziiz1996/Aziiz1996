import { useEffect } from 'react';

export function useHeaderLayout() {
 useEffect(()=>{
  const account=document.querySelector<HTMLElement>('.account-bar');const sidebar=document.querySelector<HTMLElement>('.sidebar');
  const measure=()=>{if(account)document.documentElement.style.setProperty('--account-height',`${Math.ceil(account.getBoundingClientRect().height)}px`);if(sidebar)document.documentElement.style.setProperty('--mobile-nav-height',`${Math.ceil(sidebar.getBoundingClientRect().height)}px`);};
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(account)observer?.observe(account);if(sidebar)observer?.observe(sidebar);window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);document.documentElement.style.removeProperty('--account-height');document.documentElement.style.removeProperty('--mobile-nav-height');};
 },[]);
}
