import {validateProperty,validateJpeg} from '../backend/validation.mjs';
import {insert} from './store.mjs';
import {fail,json} from './media.mjs';
async function limitedForm(req) {
  const max=20000000;
  if(Number(req.headers.get('content-length'))>max)throw fail('Request is too large.',413);
  const reader=req.body?.getReader();if(!reader)throw fail('Empty form.');
  let size=0;const chunks=[];
  for (;;) {const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fail('Request is too large.',413);}chunks.push(value);}
  return new Response(new Blob(chunks),{headers:{'content-type':req.headers.get('content-type')||''}}).formData();
}
export async function submit(req,env) {
  const form=await limitedForm(req), fields=Object.fromEntries(form), photos=form.getAll('photos');
  const {DB,MEDIA}=env, id=crypto.randomUUID();let p,message,images=[];
  try {
    if(fields.kind==='message'){
      message={id};
      for(const [name,max] of [['name',100],['email',254],['message',5000]]) {
        const v=String(fields[name]||'').trim();if(!v||v.length>max)throw Error('Check your message details.');message[name]=v;
      }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.email))throw Error('Enter a valid email.');
    } else if(fields.kind==='property'){
      p=validateProperty(fields,photos);
      for(const file of photos){if(!(file instanceof Blob))throw Error('Invalid photo.');const b=new Uint8Array(await file.arrayBuffer());validateJpeg(b);images.push(b);}
    } else throw Error('Invalid submission.');
  }catch(e){throw fail(e.message);}
  const [,reservation]=await DB.batch([DB.prepare("DELETE FROM pl2_rate_events WHERE julianday(created_at)<julianday('now','-2 hours')"),DB.prepare("INSERT INTO pl2_rate_events(created_at) SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE (SELECT count(*) FROM pl2_rate_events WHERE julianday(created_at)>=julianday('now','-1 hour'))<100")]);
  if(!reservation.meta.changes)throw fail('Please try again later.',429);
  if(message){await insert(DB,'pl2_messages',message).run();return json({ok:true});}
  const size=fields.size?Number(fields.size):null;
  if(size!==null&&(!Number.isFinite(size)||size<=0))throw fail('Invalid property size.');
  const paths=[];
  try {
    for(const [i,bytes] of images.entries()){const path=id+'/'+(i+1)+'.jpg';await MEDIA.put('images/'+path,bytes,{httpMetadata:{contentType:'image/jpeg'}});paths.push(path);}
    const row={id,title:p.title,offer:p.offer,property_type:p.type,location:p.location,price:p.price,price_period:({'Per month':'month','Per day':'day','Total price':'total'})[fields.period]||'month',bedrooms:p.bedrooms,bathrooms:p.bathrooms,size_sqm:size,features:form.getAll('features').filter(v=>['Pool','Sea view','Pet friendly','Gym','Parking','Furnished'].includes(v)),description:p.description,image_paths:paths,status:'pending'};
    await DB.batch([insert(DB,'pl2_properties',row),insert(DB,'pl2_property_contacts',{property_id:id,name:p.name,email:p.email,phone:p.phone})]);
  }catch(error){if(paths.length)await MEDIA.delete(paths.map(p=>'images/'+p));throw error;}
  return json({ok:true});
}
