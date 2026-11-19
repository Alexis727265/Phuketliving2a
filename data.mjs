import { config } from './config.mjs';
import {validVideoPath, validateVideoFile, videoBucket} from './video.mjs';
const standardVideoUploadLimit = 6_000_000;
const uploadOrigin = config.url.replace(/\.supabase\.co$/, '.storage.supabase.co');
export const imageUrl = path => path ? `${config.url}/storage/v1/object/public/${config.bucket}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
export function buildSearch(params={}) {
 const q=new URLSearchParams({select:'*',status:'eq.published'});
 const clean=v=>String(v??'').trim();
 for(const [key,col] of [['offer','offer'],['type','property_type'],['period','price_period']])if(params[key])q.set(col,'eq.'+clean(params[key]));
 if(params.min||params.max||['price-asc','price-desc'].includes(params.sort))q.append('price','gte.100');
 const areas=params.areas||[];if(areas.length)q.set('location','in.('+areas.map(x=>'"'+clean(x).replace(/["\\]/g,'')+'"').join(',')+')');
 for(const [key,col,op] of [['min','price','gte'],['max','price','lte'],['beds','bedrooms','gte'],['baths','bathrooms','gte'],['size','size_sqm','gte'],['land','details->land_sqm','gte'],['guests','details->max_guests','gte']])if(clean(params[key])!==''&&Number.isFinite(Number(params[key])))q.append(col,`${key==='beds'&&String(params.beds)==='0'?'eq':op}.${Number(params[key])}`);
 if(params.term)q.set('details->>rental_term','eq.'+params.term);
 if(params.now){q.set('details->>available_now','eq.true');q.set('details->>availability_confirmed_on','gte.'+new Date(Date.now()-30*86400000).toISOString().slice(0,10));}
 if(params.features?.length)q.set('features','cs.{'+params.features.map(x=>'"'+clean(x).replace(/["\\]/g,'')+'"').join(',')+'}');
 if(params.q){const term=clean(params.q).replace(/[*,().%_\\"'{}\[\]]/g,' ').trim().slice(0,100);if(term){const fields=['title','location','description'];const clauses=fields.map(f=>`${f}.ilike.*${term}*`);if(/^[a-f0-9-]{36}$/i.test(term))clauses.push('id.eq.'+term);q.set('or','('+clauses.join(',')+')');}}
 if(params.ids)q.set('id',params.ids.length?'in.('+params.ids.filter(x=>/^[a-f0-9-]{36}$/i.test(x)).join(',')+')':'eq.00000000-0000-0000-0000-000000000000');
 q.set('order',params.sort==='price-asc'?'price.asc,id.asc':params.sort==='price-desc'?'price.desc,id.asc':'created_at.desc,id.asc');
 q.set('limit',String(params.limit||12));q.set('offset',String(((params.page||1)-1)*(params.limit||12)));return q;
}
export function createApi({fetch:send=globalThis.fetch,sessionStore}={}) {
 try{sessionStore??=globalThis.sessionStorage;}catch{}
 const sessionKey='phuket-living-admin-session-v1';
 const persist=()=>{try{if(session)sessionStore?.setItem(sessionKey,JSON.stringify(session));else sessionStore?.removeItem(sessionKey);}catch{}};
 let session=null,refreshPromise=null;
 const json=data=>({body:JSON.stringify(data),headers:{'content-type':'application/json'}});
 async function refresh(){if(!refreshPromise)refreshPromise=(async()=>{const res=await send(config.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.publicKey,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const data=await res.json();if(!res.ok){session=null;persist();throw Error('Your session has expired. Please sign in again.');}session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};persist();})().finally(()=>refreshPromise=null);return refreshPromise;}
 async function adminAccessToken(){
  if(!session)throw Error('Please sign in first.');
  if(session.refresh_token&&session.expires_at<Date.now()/1000+90)await refresh();
  return session.access_token;
 }
 async function call(path,{method='GET',body,headers={},admin=false,rawToken,signal}={}){
  const token=rawToken||(admin?await adminAccessToken():config.anonToken);
  const res=await send(config.url+path,{method,headers:{apikey:config.publicKey,authorization:'Bearer '+token,...headers},body,signal});
  const data=res.status===204?null:await res.json().catch(()=>null);
  if(!res.ok){const message=data?.error_description||data?.msg||data?.message||data?.error;throw Error(/invalid login credentials/i.test(message||'')?'Email or password is incorrect. Please use your latest password.':String(message||'Unable to connect. Please try again.'));}
  return {data,res};
 }
 const db=async(path,opts)=>(await call(path,opts)).data;
 const validId=id=>{if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid property reference');return id;};
 const one=rows=>{if(rows?.length!==1)throw Error('The listing could not be saved. Refresh and sign in again.');return rows[0];};
 async function saveFields(id,row,updatedAt){
  const path='/rest/v1/pl2_properties?id=eq.'+validId(id)+(updatedAt?'&updated_at=eq.'+encodeURIComponent(updatedAt):'');
  return one(await db(path,{admin:true,method:'PATCH',...json(row),headers:{'content-type':'application/json',Prefer:'return=representation'}}));
 }
 function validate(p,id){
  const row={};for(const [field,max] of [['title',120],['location',100],['description',5000]]){row[field]=String(p[field]||'').trim();if(!row[field]||row[field].length>max)throw Error(`Please check ${field}. Maximum ${max} characters.`);}
  for(const [key,allowed] of Object.entries({offer:['rent','sale'],property_type:['Condo','Villa','House','Apartment','Land','Commercial'],price_period:['month','day','total'],status:['pending','published','rejected']})){if(!allowed.includes(p[key]))throw Error('Please check '+key);row[key]=p[key];}
  for(const key of ['price','bedrooms','bathrooms','size_sqm']){const n=p[key]===''||p[key]==null?null:Number(p[key]);if(key==='size_sqm'&&n===null){row[key]=null;continue;}if(n===null||!Number.isFinite(n)||(key==='price'&&(n<=0||n>1e12))||(key==='size_sqm'&&n<=0)||(['bedrooms','bathrooms'].includes(key)&&(!Number.isInteger(n)||n<0||n>50)))throw Error('Please check '+key);row[key]=n;}
  if(!Array.isArray(p.features)||p.features.length>30||p.features.some(x=>typeof x!=='string'||x.length>100))throw Error('Please check amenities');
  row.features=[...new Set(p.features.map(x=>x.trim()).filter(Boolean))];
  if(!Array.isArray(p.image_paths)||p.image_paths.length>10||new Set(p.image_paths).size!==p.image_paths.length||p.image_paths.some(x=>typeof x!=='string'||x.includes('..')||!/^[-a-f0-9]{36}\/[a-zA-Z0-9._-]+$/.test(x)))throw Error('Please check the property photos. Maximum 10.');
  if(p.video_path!==undefined){
   if(p.video_path!==null&&!validVideoPath(p.video_path,id))throw Error('The video does not belong to this property.');
   row.video_path=p.video_path;
  }
  row.image_paths=p.image_paths;row.featured=Boolean(p.featured);row.details=p.details&&typeof p.details==='object'&&!Array.isArray(p.details)?p.details:{};return row;
 }
 return {
  async search(params,{signal}={}){const {data,res}=await call('/rest/v1/pl2_properties?'+buildSearch(params),{headers:{Prefer:'count=exact'},signal});return {rows:data||[],count:Number(res.headers.get('content-range')?.split('/')[1]||0)};},
  async facets(){return db('/rest/v1/pl2_properties?select=id,location,property_type,features,price,price_period,details&status=eq.published&limit=1000');},
  async highlights(){return db('/rest/v1/pl2_properties?select=*&status=eq.published&order=featured.desc,created_at.desc&limit=12');},
  async get(id,{admin=false}={}){return (await db('/rest/v1/pl2_properties?select=*&id=eq.'+validId(id)+(admin?'':'&status=eq.published')+'&limit=1',{admin}))?.[0]||null;},
  async login(email,password){const candidate=await db('/auth/v1/token?grant_type=password',{method:'POST',...json({email:email.trim().toLowerCase(),password:String(password).replace(/[\u200B-\u200D\uFEFF]/g,'').trim()})});if(!candidate?.access_token||!candidate?.user?.id)throw Error('Unable to sign in');const rows=await db('/rest/v1/pl2_admins?select=user_id&user_id=eq.'+encodeURIComponent(candidate.user.id),{rawToken:candidate.access_token});if(!rows?.length){await db('/auth/v1/logout',{method:'POST',rawToken:candidate.access_token}).catch(()=>{});throw Error('This account is not authorized to manage properties.');}session={...candidate,expires_at:Date.now()/1000+candidate.expires_in};persist();return candidate.user;},
  async logout(){const token=session?.access_token;session=null;persist();if(token)await db('/auth/v1/logout?scope=local',{method:'POST',rawToken:token});},
  async restoreSession(){try{const cached=JSON.parse(sessionStore?.getItem(sessionKey)||'null');if(!cached?.access_token||!cached?.refresh_token)return false;session=cached;if(session.expires_at<Date.now()/1000+90)await refresh();const user=await db('/auth/v1/user',{rawToken:session.access_token});const rows=await db('/rest/v1/pl2_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{rawToken:session.access_token});if(!rows?.length)throw Error('Administrator access required');session.user=user;persist();return true;}catch{session=null;persist();return false;}},
  isLoggedIn(){return !!session;},
  async all(){return db('/rest/v1/pl2_properties?select=*&order=updated_at.desc&limit=1000',{admin:true});},
  async messages(){return db('/rest/v1/pl2_messages?select=*&order=created_at.desc&limit=100',{admin:true});},
  async contacts(id){return (await db('/rest/v1/pl2_property_contacts?property_id=eq.'+validId(id),{admin:true}))?.[0]||null;},
  async save(id,p,expectedUpdatedAt){const row=validate(p,id);if(row.image_paths.some(x=>!x.startsWith(id+'/')))throw Error('A photo does not belong to this property.');return saveFields(id,row,expectedUpdatedAt);},
  async saveVideo(id,path,expectedUpdatedAt){
   if(path!==null&&!validVideoPath(path,id))throw Error('The video does not belong to this property.');
   return saveFields(id,{video_path:path},expectedUpdatedAt);
  },
  async create(id,p){const row=validate(p,id);if(row.image_paths.some(x=>!x.startsWith(id+'/')))throw Error('A photo does not belong to this property.');return one(await db('/rest/v1/pl2_properties',{admin:true,method:'POST',...json({id:validId(id),...row}),headers:{'content-type':'application/json',Prefer:'return=representation'}}));},
  async saveContact(id,p){return db('/rest/v1/pl2_property_contacts?on_conflict=property_id',{admin:true,method:'POST',...json({property_id:validId(id),name:p.name,email:p.email,phone:p.phone}),headers:{'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}});},
  async setStatus(id,status){if(!['pending','published','rejected'].includes(status))throw Error('Invalid status');return one(await db('/rest/v1/pl2_properties?id=eq.'+validId(id),{admin:true,method:'PATCH',...json({status}),headers:{'content-type':'application/json',Prefer:'return=representation'}}));},
  async upload(id,blob){if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size>3000000)throw Error('Upload must be a JPEG under 3 MB');const path=validId(id)+'/'+crypto.randomUUID()+'.jpg';await db('/storage/v1/object/'+config.bucket+'/'+path,{admin:true,method:'POST',body:blob,headers:{'content-type':'image/jpeg','x-upsert':'false'}});return path;},
  async cleanImages(id,paths){if(!paths.length)return;if(paths.some(x=>!x.startsWith(validId(id)+'/')||x.includes('..')))throw Error('Unsafe image path');const current=await this.get(id,{admin:true});const unused=paths.filter(x=>!current?.image_paths?.includes(x));if(unused.length)await db('/storage/v1/object/'+config.bucket,{admin:true,method:'DELETE',...json({prefixes:unused})});},
  async uploadVideo(path,file,onProgress){
   if(!validVideoPath(path))throw Error('Invalid property video path.');
   await validateVideoFile(file);
   if(file.size<=standardVideoUploadLimit){
    onProgress?.(0);
    await db(`/storage/v1/object/${videoBucket}/${path}`,{
     admin:true,method:'POST',body:file,headers:{'content-type':'video/mp4','x-upsert':'false'},
    });
    onProgress?.(100);
    return;
   }
   await adminAccessToken();
   const {Upload}=await import('./tus.mjs');
   await new Promise((resolve,reject)=>{
    const upload=new Upload(file,{
     endpoint:uploadOrigin+'/storage/v1/upload/resumable',
     headers:{apikey:config.publicKey},
     onBeforeRequest:async request=>request.setHeader('authorization','Bearer '+await adminAccessToken()),
     metadata:{bucketName:videoBucket,objectName:path,contentType:'video/mp4'},
     chunkSize:6*1024*1024,
     retryDelays:[0,1000,3000,5000,10000],
     uploadDataDuringCreation:true,
     removeFingerprintOnSuccess:true,
     fingerprint:async()=>`phuket-living-video:${path}`,
     onProgress:(uploaded,total)=>onProgress?.(Math.round(uploaded/total*100)),
     onError:error=>{
      const status=error.originalResponse?.getStatus();
      if(status===401||status===403)reject(Error('Video upload was denied. Sign in again and retry.'));
      else if(status===413)reject(Error('Supabase rejected this video because of its size. Choose a smaller MP4.'));
      else reject(Error('Video upload failed. Check your connection and save again to retry.'));
     },
     onSuccess:resolve,
    });
    upload.findPreviousUploads().then(previous=>{
     if(previous[0])upload.resumeFromPreviousUpload(previous[0]);
     upload.start();
    }).catch(reject);
   });
  },
  async videoPreview(path){
   if(!validVideoPath(path))throw Error('Invalid property video path.');
   const data=await db(`/storage/v1/object/sign/${videoBucket}/${path}`,{admin:true,method:'POST',...json({expiresIn:3600})});
   if(!data?.signedURL?.startsWith(`/object/sign/${videoBucket}/${path}?`))throw Error('Video preview is unavailable.');
   return config.url+'/storage/v1'+data.signedURL;
  },
  async cleanVideos(id,paths){
   if(!paths.length)return;
   if(paths.some(path=>!validVideoPath(path,id)))throw Error('Unsafe video path');
   const current=await this.get(id,{admin:true});
   const unused=[...new Set(paths)].filter(path=>path!==current?.video_path);
   if(unused.length)await db('/storage/v1/object/'+videoBucket,{admin:true,method:'DELETE',...json({prefixes:unused})});
  },
  async delete(id){
   const row=one(await db('/rest/v1/pl2_properties?id=eq.'+validId(id)+'&select=id,image_paths,video_path',{admin:true,method:'DELETE',headers:{Prefer:'return=representation'}}));
   const cleanup=await Promise.allSettled([this.cleanImages(id,row.image_paths||[]),this.cleanVideos(id,row.video_path?[row.video_path]:[])]);
   return {cleanupFailed:cleanup.some(result=>result.status==='rejected')};
  },
  async sendForm(form){return db('/functions/v1/pl2-submit',{method:'POST',body:form});},
  async resetPassword(email){return db('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/'),{method:'POST',...json({email:email.trim().toLowerCase()})});},
  async recovery(token){const user=await db('/auth/v1/user',{rawToken:token});const rows=await db('/rest/v1/pl2_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{rawToken:token});if(!rows?.length)throw Error('Not an administrator');session={access_token:token,user};},
  async changePassword(password){if(password.length<12)throw Error('Use at least 12 characters');return db('/auth/v1/user',{method:'PUT',admin:true,...json({password})});},
 };
}
