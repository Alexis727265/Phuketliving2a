import {displayPrice,displayPeriod} from './pricing.mjs';
import {imageUrl} from './cloudflare/client.mjs';
export const $=(q,root=document)=>root.querySelector(q);
export const $$=(q,root=document)=>[...root.querySelectorAll(q)];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const cleanTitle=s=>String(s||'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').trim().toLowerCase().replace(/(^|[\s—–])\p{L}/gu,c=>c.toUpperCase()).replace(/\b(Phuket|Condo|Villa|For|Rent|Sale|And|Or)\b/g,c=>c).replace(/\s+/g,' ');
export const price=displayPrice;
export const period=displayPeriod;
export const ref=p=>{const m=p.description?.match(/(?:REF(?:ERENCE)?\s*[:：]\s*)([A-Z0-9][A-Z0-9-]+)/i);return m?.[1]||p.id;};
export const link=p=>location.origin+'/property/'+p.id;
export const whatsapp=(p,intent='I would like to ask about this property',extra='')=>'https://wa.me/66960122530?text='+encodeURIComponent(`Hello Phuket Living, ${intent}.\n\n${p.title}\nReference: ${ref(p)}\n${link(p)}${extra?'\n\n'+extra:''}`);
let timer;export function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
export async function share(p){const data={title:cleanTitle(p.title),text:'View this property on Phuket Living',url:link(p)};if(navigator.share&&(!navigator.canShare||navigator.canShare(data))){try{await navigator.share(data);return;}catch(e){if(e.name==='AbortError')return;}}await copy(link(p));}
export async function copy(value){try{await navigator.clipboard.writeText(value);toast('Property link copied');}catch{const d=$('#confirm-dialog');d.innerHTML='<h3>Copy this property link</h3><input readonly aria-label="Property link"><button class="btn" data-close>Done</button>';d.querySelector('input').value=value;d.querySelector('[data-close]').onclick=()=>d.close();d.showModal();d.querySelector('input').select();}}
export function storageGet(key,otherwise){try{return JSON.parse(localStorage.getItem(key))??otherwise;}catch{return otherwise;}}
export const favorites=new Set(storageGet('phuket-living-saved',[]).filter(x=>/^[a-f0-9-]{36}$/i.test(x)));
export function syncFavorites(){try{localStorage.setItem('phuket-living-saved',JSON.stringify([...favorites]));}catch{}const n=$('#saved-count');if(n)n.textContent=favorites.size||'';$$('[data-favorite]').forEach(b=>{const saved=favorites.has(b.dataset.favorite);b.setAttribute('aria-pressed',String(saved));b.setAttribute('aria-label',saved?'Remove from saved properties':'Save property');b.textContent=saved?'♥':'♡';});}
export function favoriteButton(p,cls='favorite'){return `<button class="icon-btn ${cls}" type="button" data-favorite="${p.id}" aria-label="Save property" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id)?'♥':'♡'}</button>`;}
export function card(p,i=0){const imgs=p.image_paths||[];return `<article class="property-card"><a class="card-media" href="/property/${p.id}" data-property="${p.id}" aria-label="View ${esc(cleanTitle(p.title))}">${imgs[0]?`<img loading="lazy" decoding="async" src="${esc(imageUrl(imgs[0]))}" alt="${esc(cleanTitle(p.title))}" width="640" height="450">`:''}${imgs[1]?`<img class="second-photo" loading="lazy" decoding="async" src="${esc(imageUrl(imgs[1]))}" alt="Another view of ${esc(p.property_type)} in ${esc(p.location)}" width="640" height="450">`:''}<span class="card-tag">${p.featured?'FEATURED':p.offer==='sale'?'FOR SALE':p.property_type.toUpperCase()}</span></a>${favoriteButton(p)}<div class="card-body"><p class="card-location">${esc(p.location)} · ${p.offer==='sale'?'FOR SALE':'FOR RENT'}</p><a href="/property/${p.id}" data-property="${p.id}"><h3 class="card-title">${esc(cleanTitle(p.title))}</h3></a><div class="card-facts"><span>${p.bedrooms===0?'Studio':p.bedrooms+' bedrooms'}</span><span>${p.bathrooms} bathrooms</span>${p.size_sqm?`<span>${Number(p.size_sqm).toLocaleString()} m²</span>`:''}</div><div class="card-footer"><strong class="card-price">${price(p)} <small>${period(p)}</small></strong><button class="icon-btn card-share" type="button" data-share="${p.id}" aria-label="Share ${esc(cleanTitle(p.title))}"><svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div></div></article>`;}
export async function compressImage(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Select JPG, PNG or WebP photos.');if(file.size>40e6)throw Error('Choose photos smaller than 40 MB.');const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});try{const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height),1080/Math.min(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.88,.78,.65]){const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare this photo')),'image/jpeg',quality));if(blob.size<3e6)return blob;}throw Error('This photo is too large after resizing.');}finally{bitmap.close();}}
let observer;
export function observe() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!observer) {
    document.body.classList.add('motion-ready');
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    }, { threshold: .06 });
  }
  $$('.reveal:not(.in-view)').forEach(element => observer.observe(element));
}
