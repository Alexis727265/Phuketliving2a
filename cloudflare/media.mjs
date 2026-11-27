import {validVideoPath,maxVideoBytes} from '../video.mjs';
import {validateJpeg} from '../backend/validation.mjs';
const chunk=8*1024*1024;
export const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const photoPath=path=>/^[a-f\d-]{36}\/[\w.-]+\.jpe?g$/i.test(path) && !path.includes('..');
export async function mediaResponse(request,bucket,key,video) {
  const head=await bucket.head(key);
  if (!head) return new Response(null,{status:404});
  const h=new Headers({'content-type':video?'video/mp4':'image/jpeg','cache-control':video?'private, no-store':'public, max-age=3600','x-content-type-options':'nosniff','accept-ranges':'bytes','etag':head.httpEtag});
  const range=request.headers.get('range');
  let start=0,end=head.size-1,status=200;
  if (range && (!request.headers.has('if-range')||request.headers.get('if-range')===head.httpEtag)) {
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1]||m[2])) {
      start=m[1]?Number(m[1]):Math.max(0,head.size-Number(m[2]));
      end=m[1]&&m[2]?Math.min(head.size-1,Number(m[2])):head.size-1;
      if (start>=head.size||end<start) { h.set('content-range','bytes */'+head.size);return new Response(null,{status:416,headers:h}); }
      status=206;h.set('content-range',`bytes ${start}-${end}/${head.size}`);
    }
  }
  h.set('content-length',String(end-start+1));
  if(request.method==='HEAD')return new Response(null,{status,headers:h});
  const object=await bucket.get(key,status===206?{range:{offset:start,length:end-start+1}}:{});
  return object?new Response(object.body,{status,headers:h}):new Response(null,{status:404});
}
export async function putPhoto(req,env,path) {
  if(!photoPath(path)||!req.body||Number(req.headers.get('content-length')||Infinity)>3000000) throw fail('Choose a JPEG under 3 MB.');
  const bytes=new Uint8Array(await req.arrayBuffer());validateJpeg(bytes);
  const object=await env.MEDIA.put('images/'+path,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'image/jpeg'}});
  if(!object)throw fail('That photo already exists.',409);
  return json({ok:true});
}
export async function upload(req,env,path) {
  if(!validVideoPath(path)) throw fail('Invalid video path.');
  const key='videos/'+path, {DB,MEDIA}=env;
  const state=()=>DB.prepare('SELECT * FROM video_uploads WHERE path=?').bind(path).first();
  if(req.method==='POST') {
    const {size}=await req.json();
    if(!Number.isSafeInteger(size)||size<1||size>maxVideoBytes)throw fail('Choose an MP4 up to 100 MB.',413);
    const existing=await MEDIA.head(key);
    if(existing){if(existing.size!==size)throw fail('A different video already exists.',409);return json({complete:true});}
    let s=await state();
    if(!s){
      const newUpload=await MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:'video/mp4'}});
      try { await DB.prepare('INSERT INTO video_uploads(path,upload_id,bytes) VALUES(?,?,?)').bind(path,newUpload.uploadId,size).run(); }
      catch(error){await newUpload.abort();if(!await state())throw error;}
      s=await state();
    }
    if(s.bytes!==size)throw fail('Choose the original video to resume.',409);
    return json({uploadId:s.upload_id});
  }
  const s=await state();
  if(!s) {if(req.method==='PATCH' && await MEDIA.head(key))return json({complete:true});throw fail('Upload expired. Select the video again.',409);}
  const upload=MEDIA.resumeMultipartUpload(key,s.upload_id),total=Math.ceil(s.bytes/chunk);
  if(req.method==='PUT') {
    const n=Number(new URL(req.url).searchParams.get('part')),expected=n===total?s.bytes-(n-1)*chunk:chunk;
    if(!Number.isInteger(n)||n<1||n>total||Number(req.headers.get('content-length'))!==expected)throw fail('Invalid video part length.');
    const data=await req.arrayBuffer();
    if(data.byteLength!==expected)throw fail('Incomplete video part.');
    if(n===1 && new TextDecoder().decode(data.slice(4,8))!=='ftyp')throw fail('Choose an MP4 video.');
    return json(await upload.uploadPart(n,data));
  }
  if(req.method==='PATCH'){
    const {parts}=await req.json();
    if(!Array.isArray(parts)||parts.length!==total||parts.some((p,i)=>p?.partNumber!==i+1||typeof p.etag!=='string'))throw fail('Upload is incomplete.');
    await upload.complete(parts.map(({partNumber,etag})=>({partNumber,etag})));
    await DB.prepare('DELETE FROM video_uploads WHERE path=? AND upload_id=?').bind(path,s.upload_id).run();
    return json({complete:true});
  }
  throw fail('Method not allowed.',405);
}
