'use strict';
const body=document.body, theme=document.querySelector('.theme');
function setTheme(dark){body.classList.toggle('dark',dark);theme.textContent=dark?'☀':'☾';theme.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');localStorage.setItem('phuket-theme',dark?'dark':'light')};
setTheme(localStorage.getItem('phuket-theme')==='dark');theme.addEventListener('click',()=>setTheme(!body.classList.contains('dark')));
const menu=document.querySelector('.menu'),nav=document.querySelector('nav');menu.addEventListener('click',()=>{let open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});nav.addEventListener('click',e=>{if(e.target.closest('a')){nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}});
const submission=document.querySelector('#submission'),admin=document.querySelector('#admin');document.querySelector('#open-submit').addEventListener('click',()=>submission.showModal());document.querySelector('#admin-open').addEventListener('click',()=>admin.showModal());document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
const photos=document.querySelector('#photos'), previews=document.querySelector('#previews'),photoStatus=document.querySelector('#photo-status');let urls=[];window.compressedPhotos=[]; let compressedPhotos=window.compressedPhotos;
async function compressImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please select JPG, PNG or WebP images.');
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 const dimensions=fit1080(bitmap.width,bitmap.height);
 const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('Could not compress image.')),'image/jpeg',0.82));return blob;
}
let photoRevision=0;
photos.addEventListener('change',async()=>{const revision=++photoRevision;urls.forEach(URL.revokeObjectURL);urls=[];compressedPhotos=[];window.compressedPhotos=compressedPhotos;previews.replaceChildren();if(photos.files.length>10){photos.value='';photoStatus.textContent='Please select no more than 10 images.';return}if(!photos.files.length){photoStatus.textContent='JPG, PNG or WebP. Your images will be resized before upload.';return}photoStatus.textContent='Preparing your photos…';try{for(const file of photos.files){const blob=await compressImage(file);if(revision!==photoRevision)return;compressedPhotos.push(blob);const url=URL.createObjectURL(blob);urls.push(url);const img=document.createElement('img');img.src=url;img.alt='Compressed property photo';previews.append(img)}photoStatus.textContent=`${compressedPhotos.length} of 10 photos prepared at up to 1080p.`}catch(error){if(revision!==photoRevision)return;photos.value='';compressedPhotos=[];window.compressedPhotos=compressedPhotos;urls.forEach(URL.revokeObjectURL);urls=[];previews.replaceChildren();photoStatus.textContent=error.message||'Could not read the selected images.'}});
