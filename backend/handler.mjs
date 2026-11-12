import { validateProperty, validateJpeg } from './validation.mjs';
const MAX_REQUEST_BYTES = 20_000_000;
const bucket = 'phuketliving2-images';
const cors = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods':'POST, OPTIONS', 'cache-control':'no-store' };
const response = (code, body) => new Response(JSON.stringify(body),{status:code,headers:{...cors,'content-type':'application/json'}});
function clean(value, max){ if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('Please check your message details');return value.trim(); }
async function readLimited(req){
 const reader=req.body?.getReader(); if(!reader)throw new Error('Empty request');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_REQUEST_BYTES){await reader.cancel();throw new Error('Request is too large');}chunks.push(value);}
 return new Blob(chunks);
}
export async function handle(req, ctx){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return response(405,{error:'Method not allowed'});
 if(!ctx.url||!ctx.key)return response(503,{error:'Service is not configured'});
 const auth={'apikey':ctx.key,'authorization':`Bearer ${ctx.key}`};
 const db=async(path, options={})=>{
  const result=await ctx.fetch(`${ctx.url}${path}`,{...options,headers:{...auth,...options.headers}});
  if(!result.ok)throw new Error('Service is temporarily unavailable');
  const text=await result.text();return text?JSON.parse(text):null;
 };
 try{
  const contentType=req.headers.get('content-type')||'';
  const blob=await readLimited(req);
  const form=await new Request('https://example.invalid/',{method:'POST',headers:{'content-type':contentType},body:blob}).formData();
  const kind=form.get('kind'); let property, photoBytes=[]; let message;
  if(kind==='message'){
   message={name:clean(form.get('name'),100),email:clean(form.get('email'),254),message:clean(form.get('message'),5000)};
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.email))throw new Error('Enter a valid email');
  } else if(kind==='property'){
   const photos=form.getAll('photos');property=validateProperty(Object.fromEntries(form.entries()),photos);
   for(const file of photos){if(!(file instanceof Blob))throw new Error('Invalid photo');const bytes=new Uint8Array(await file.arrayBuffer());validateJpeg(bytes);photoBytes.push(bytes);}
  } else throw new Error('Invalid request');
  const allowed=await db('/rest/v1/rpc/pl2_reserve_submission',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(!allowed)return response(429,{error:'Please try again later'});
  if(message){await db('/rest/v1/pl2_messages',{method:'POST',headers:{'content-type':'application/json','prefer':'return=minimal'},body:JSON.stringify(message)});return response(200,{ok:true});}
  // Provision through the Storage API, never by mutating storage metadata tables.
  if(photoBytes.length){const check=await ctx.fetch(`${ctx.url}/storage/v1/bucket/${bucket}`,{headers:auth});if(check.status===404 || (check.status===400 && (await check.clone().text()).toLowerCase().includes('bucket not found'))){const result=await ctx.fetch(`${ctx.url}/storage/v1/bucket`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:true,file_size_limit:3000000,allowed_mime_types:['image/jpeg']})});if(!result.ok&&result.status!==409)throw new Error('Storage is temporarily unavailable');}else if(!check.ok)throw new Error('Storage is temporarily unavailable');}
  const id=crypto.randomUUID();const uploaded=[];
  try{
   for(let i=0;i<photoBytes.length;i++){const path=`${id}/${i+1}.jpg`;const result=await ctx.fetch(`${ctx.url}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{...auth,'content-type':'image/jpeg','x-upsert':'false'},body:photoBytes[i]});if(!result.ok)throw new Error('Photo upload failed');uploaded.push(path);}
   const fields=Object.fromEntries(form.entries());const period=({ 'Per month':'month','Per day':'day','Total price':'total' })[fields.period]||'month';
   const size=fields.size?Number(fields.size):null;if(size!==null&&(!Number.isFinite(size)||size<=0))throw new Error('Invalid property size');
   const allowedFeatures=new Set(['Pool','Sea view','Pet friendly','Gym','Parking','Furnished']);const features=form.getAll('features').filter(x=>typeof x==='string'&&allowedFeatures.has(x));
   await db('/rest/v1/pl2_properties',{method:'POST',headers:{'content-type':'application/json','prefer':'return=minimal'},body:JSON.stringify({id,title:property.title,offer:property.offer,property_type:property.type,location:property.location,price:property.price,price_period:period,bedrooms:property.bedrooms,bathrooms:property.bathrooms,size_sqm:size,features,description:property.description,image_paths:uploaded})});
   await db('/rest/v1/pl2_property_contacts',{method:'POST',headers:{'content-type':'application/json','prefer':'return=minimal'},body:JSON.stringify({property_id:id,name:property.name,email:property.email,phone:property.phone})});
   return response(200,{ok:true});
  } catch(error){
   try{await ctx.fetch(`${ctx.url}/rest/v1/pl2_properties?id=eq.${id}`,{method:'DELETE',headers:auth});if(uploaded.length)await ctx.fetch(`${ctx.url}/storage/v1/object/${bucket}`,{method:'DELETE',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({prefixes:uploaded})});}catch{}
   throw error;
  }
 }catch(error){const msg=error instanceof Error?error.message:'Request could not be processed';const known=/required|invalid|valid |must |select |check |too large|malformed|dimensions|jpeg|1080p/i.test(msg);return response(known?400:503,{error:known?msg:'Unable to submit right now. Please try again.'});}
}
