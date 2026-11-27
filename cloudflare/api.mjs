import {property,rows,search,insert,encode} from './store.mjs';
import {json,fail,photoPath,mediaResponse,putPhoto,upload} from './media.mjs';
import {adminIdentity} from './auth.mjs';
import {validate} from './listing.mjs';
import {validVideoPath} from '../video.mjs';
import {submit} from './submission.mjs';
const idPattern=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
async function cleanup(env,id,kind,paths) {
  if(!['images','videos'].includes(kind)||!Array.isArray(paths)||paths.length>40||paths.some(p=>typeof p!=='string'||!p.startsWith(id+'/')||!(kind==='images'?photoPath(p):validVideoPath(p,id))))throw fail('Invalid media path.');
  const current=await property(env.DB,id,true);
  const unused=[...new Set(paths)].filter(p=>!(kind==='images'?current?.image_paths?.includes(p):current?.video_path===p));
  if(unused.length)await env.MEDIA.delete(unused.map(p=>kind+'/'+p));
  if(kind==='videos')for(const path of unused){
    const state=await env.DB.prepare('SELECT upload_id FROM video_uploads WHERE path=?').bind(path).first();
    if(state){await env.MEDIA.resumeMultipartUpload('videos/'+path,state.upload_id).abort().catch(()=>{});await env.DB.prepare('DELETE FROM video_uploads WHERE path=?').bind(path).run();}
  }
}
async function saveProperty(req,env,id) {
  const {row,expectedUpdatedAt}=await req.json();
  if(!row||Array.isArray(row)||typeof row!=='object')throw fail('Invalid listing.');
  let data;
  try {
    if(req.method==='PATCH'&&Object.keys(row).length===1&&Object.hasOwn(row,'video_path')){
      if(row.video_path!==null&&!validVideoPath(row.video_path,id))throw Error('Invalid video path.');
      data={video_path:row.video_path};
    }else if(req.method==='PATCH'&&Object.keys(row).length===1&&['pending','published','rejected'].includes(row.status)){data={status:row.status};}
    else data=validate(row,id);
  }catch(e){throw fail(e.message);}
  const photos=data.image_paths||[];
  if(photos.some(p=>!photoPath(p)||!p.startsWith(id+'/')))throw fail('Invalid property photos.');
  const media=[...photos.map(p=>'images/'+p),...(data.video_path?['videos/'+data.video_path]:[])];
  const found=await Promise.all(media.map(key=>env.MEDIA.head(key)));
  if(found.some(x=>!x))throw fail('A selected upload is missing. Select the file again.');
  if(req.method==='POST') {
    if(await property(env.DB,id,true))throw fail('Property already exists.',409);
    await insert(env.DB,'pl2_properties',{id,...data}).run();
  }else{
    data.updated_at=new Date().toISOString();
    const args=[...Object.values(data).map(encode),id];
    if(expectedUpdatedAt)args.push(expectedUpdatedAt);
    const result=await env.DB.prepare('UPDATE pl2_properties SET '+Object.keys(data).map(k=>k+'=?').join(',')+' WHERE id=?'+(expectedUpdatedAt?' AND updated_at=?':'')).bind(...args).run();
    if(result.meta.changes!==1)throw fail('The listing has changed. Refresh and try again.',409);
  }
  return json(await property(env.DB,id,true));
}
export async function adminRoute(req,env,tail,identity) {
  if(!identity)throw fail('Sign in as an administrator.',401);
  const {DB}=env,m=req.method;
  if(!['GET','HEAD'].includes(m)){
    if(env.STAGING_READ_ONLY==='1')throw fail('This preview is read-only.',503);
    const origin=req.headers.get('origin');
    if((origin&&origin!==new URL(req.url).origin)||req.headers.get('x-phuket-admin')!=='1')throw fail('Open the admin dashboard to make changes.',403);
  }
  const slash=tail.indexOf('/'),action=slash<0?tail:tail.slice(0,slash),path=slash<0?'':tail.slice(slash+1);
  if(m==='GET'&&!path){
    if(action==='session')return json(identity);
    if(action==='properties')return json(await rows(DB.prepare('SELECT * FROM pl2_properties ORDER BY updated_at DESC')));
    if(action==='messages')return json(await rows(DB.prepare('SELECT * FROM pl2_messages ORDER BY created_at DESC LIMIT 100')));
  }
  if(action==='uploads')return upload(req,env,path);
  if(action==='images'&&m==='PUT')return putPhoto(req,env,path);
  if(action==='preview'&&validVideoPath(path)){
    if(!await env.MEDIA.head('videos/'+path))throw fail('Video unavailable.',404);
    if(m==='POST')return json({url:'/studio/api/preview/'+path});
    if(m==='GET'||m==='HEAD')return mediaResponse(req,env.MEDIA,'videos/'+path,true);
  }
  if(!idPattern.test(path))throw fail('Unknown endpoint.',404);
  if(action==='contacts'){
    if(m==='GET')return json(await DB.prepare('SELECT * FROM pl2_property_contacts WHERE property_id=?').bind(path).first());
    if(m==='PUT'){
      const fields=await req.json(),v=[];
      for(const [name,min,max] of [['name',1,100],['email',3,254],['phone',1,40]]){const value=fields[name]??null;if(value!==null&&(typeof value!=='string'||value.length<min||value.length>max))throw fail('Check owner '+name+'.');v.push(value);}
      await DB.prepare('INSERT INTO pl2_property_contacts(property_id,name,email,phone) VALUES(?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone').bind(path,...v).run();return json({ok:true});
    }
  }
  if(action==='cleanup'&&m==='POST'){const {kind,paths}=await req.json();await cleanup(env,path,kind,paths);return json({ok:true});}
  if(action==='properties'){
    if(m==='GET')return json(await property(DB,path,true));
    if(m==='POST'||m==='PATCH')return saveProperty(req,env,path);
    if(m==='DELETE'){
      const gone=await DB.prepare('DELETE FROM pl2_properties WHERE id=? RETURNING image_paths,video_path').bind(path).first();
      if(!gone)throw fail('Listing already removed.',404);
      const cleanupResults=await Promise.allSettled([cleanup(env,path,'images',JSON.parse(gone.image_paths)),cleanup(env,path,'videos',gone.video_path?[gone.video_path]:[])]);
      return json({cleanupFailed:cleanupResults.some(x=>x.status==='rejected')});
    }
  }
  throw fail('Unknown endpoint.',404);
}
export async function cloudRoute(req,env) {
  const url=new URL(req.url),p=url.pathname,m=req.method;
  try {
    if(p.startsWith('/studio/api/'))return await adminRoute(req,env,p.slice('/studio/api/'.length),await adminIdentity(req,env));
    if(p==='/api/search'&&m==='POST'){if(Number(req.headers.get('content-length'))>64000)throw fail('Search request too large.',413);return json(await search(env.DB,await req.json()));}
    if(p==='/api/submit'&&m==='POST'){
      if(env.STAGING_READ_ONLY==='1')throw fail('This preview is read-only.',503);
      return await submit(req,env);
    }
    if(!['GET','HEAD'].includes(m))throw fail('Method not allowed.',405);
    if(p==='/api/facets')return json(await rows(env.DB.prepare("SELECT id,location,property_type,features,price,price_period,details FROM pl2_properties WHERE status='published' LIMIT 1000")));
    if(p==='/api/highlights')return json(await rows(env.DB.prepare("SELECT * FROM pl2_properties WHERE status='published' ORDER BY featured DESC,created_at DESC LIMIT 12")));
    if(p.startsWith('/api/properties/'))return json(await property(env.DB,p.slice(16)));
    if(p.startsWith('/images/')) {const path=decodeURIComponent(p.slice(8));if(!path||path.includes('..'))throw fail('Photo unavailable.',404);return await mediaResponse(req,env.MEDIA,'images/'+path,false);}
    if(p.startsWith('/videos/')){
      const path=p.slice(8);if(!validVideoPath(path)||!await env.DB.prepare("SELECT 1 FROM pl2_properties WHERE id=? AND video_path=? AND status='published'").bind(path.split('/')[0],path).first())throw fail('Video unavailable.',404);
      return await mediaResponse(req,env.MEDIA,'videos/'+path,true);
    }
    throw fail('Unknown endpoint.',404);
  }catch(e){return json({error:e.status?e.message:'Unable to complete the request. Please try again.'},e.status||500);}
}
