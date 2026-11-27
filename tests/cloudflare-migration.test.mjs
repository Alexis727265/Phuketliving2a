import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {adminRoute, cloudRoute} from '../cloudflare/api.mjs';
import {makeWorker} from '../worker.mjs';
import {createApi} from '../cloudflare/client.mjs';
import {validateVideoFile,maxVideoBytes} from '../video.mjs';

function harness() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
  const prepare = (sql, args=[]) => {
    const s=sqlite.prepare(sql);
    return {
      bind: (...values)=>prepare(sql,values),
      first: async ()=>s.get(...args) || null,
      all: async ()=>({results:s.all(...args)}),
      run: async ()=>({meta:{changes:s.run(...args).changes}}),
    };
  };
  const objects=new Map(), uploads=new Map();
  function info(key,data) {return {key,size:data.length,httpEtag:'"test"'};}
  function multipart(key,uploadId) {
    return {
      uploadId,
      async uploadPart(partNumber,buffer) {
        const part={partNumber,etag:String(partNumber)};
        uploads.get(uploadId).set(partNumber,Buffer.from(buffer));
        return part;
      },
      async complete(parts) {
        const data=Buffer.concat(parts.map(({partNumber})=>uploads.get(uploadId).get(partNumber)));
        objects.set(key,data);
        uploads.delete(uploadId);
      },
      async abort() {uploads.delete(uploadId);},
    };
  }
  const env={
    DB:{prepare},
    MEDIA:{
      head:async key=>objects.has(key)?info(key,objects.get(key)):null,
      get:async (key,{range}={})=>{const data=objects.get(key);return data?{body:range?data.subarray(range.offset,range.offset+range.length):data}:null;},
      put:async (key,data)=>{objects.set(key,Buffer.from(data));return info(key,data);},
      delete:async keys=>{for(const key of [keys].flat())objects.delete(key);},
      createMultipartUpload:async key=>{const id=randomUUID();uploads.set(id,new Map());return multipart(key,id);},
      resumeMultipartUpload:multipart,
    },
  };
  env.DB.batch=async statements=>{
    sqlite.exec('BEGIN');
    try {
      const results=[];
      for (const s of statements) results.push(s.columnCount ? await s.all() : await s.run());
      sqlite.exec('COMMIT');
      return results;
    } catch(error) {sqlite.exec('ROLLBACK');throw error;}
  };
  env.DB.prepare=function wrap(sql,...args){
    const make=(values)=>({...prepare(sql,values),columnCount:sqlite.prepare(sql).columns().length,bind:(...bound)=>make(bound)});
    return make(args);
  };
  const origin='https://stage.invalid';
  const identity={user_id:randomUUID()};
  const send=async (path, opts={})=>{
    const headers=new Headers(opts.headers);
    if(opts.body instanceof Blob)headers.set('content-length',String(opts.body.size));
    const req=new Request(origin+path,{...opts,headers});
    if(!path.startsWith('/studio/api/'))return cloudRoute(req,env);
    try {return await adminRoute(req,env,path.split('?')[0].slice(12),identity);}
    catch(error) {return Response.json({error:error.message},{status:error.status||500});}
  };
  return {env,objects,send};
}

test('Cloudflare storage upload accepts a 100 MB MP4, rejects one byte more and serves a byte range', async ()=>{
  const {env,objects,send}=harness();
  const api=createApi(send);
  const id=randomUUID(), path=id+'/'+randomUUID()+'.mp4';
  const source=Buffer.alloc(maxVideoBytes);
  source.write('ftypisom',4);
  const file=new File([source],'size-limit.mp4',{type:'video/mp4'});
  const tooLarge=new File([file,'x'],'over-limit.mp4',{type:'video/mp4'});
  await assert.rejects(validateVideoFile(tooLarge),/100 MB/);
  const rejected=await send('/studio/api/uploads/'+path,{method:'POST',body:JSON.stringify({size:maxVideoBytes+1}),headers:{'x-phuket-admin':'1'}});
  assert.equal(rejected.status,413);
  const progress=[];
  await api.uploadVideo(path,file,value=>progress.push(value));
  assert.equal(progress.at(-1),100);
  const video=objects.get('videos/'+path);
  assert.equal(video.length,maxVideoBytes);
  assert.deepEqual(video.subarray(0,12),source.subarray(0,12));
  const p={title:'Migration test listing',location:'Bang Tao',description:'A test property.',offer:'rent',property_type:'Villa',price_period:'month',status:'pending',price:10000,bedrooms:1,bathrooms:1,features:[],image_paths:[],video_path:path};
  const created=await api.create(id,p);
  await api.saveContact(id,{phone:'0123456789',name:'',email:''});
  assert.deepEqual((await api.contacts(id)).phone,'0123456789');
  assert.equal(await api.get(id),null);
  const url=await api.videoPreview(path);
  const preview=await send(url,{headers:{range:'bytes=4-11'}});
  assert.equal(preview.status,206);
  assert.equal(await preview.text(),'ftypisom');
  const missing=await send('/videos/'+path);
  assert.equal(missing.status,404);
  await api.setStatus(id,'published');
  assert.equal((await api.search({offer:'rent',areas:['Bang Tao']})).count,1);
  assert.equal((await api.search({beds:2})).count,0);
  const publicVideo=await send('/videos/'+path,{headers:{range:'bytes=-10'}});
  assert.equal(publicVideo.status,206);
  assert.equal(publicVideo.headers.get('content-range'),'bytes 99999990-99999999/100000000');
  await assert.rejects(api.save(id,p,'2000-01-01T00:00:00Z'),/listing has changed/i);
  assert.ok(created.updated_at);
  assert.deepEqual(await api.delete(id),{cleanupFailed:false});
  assert.equal(objects.has('videos/'+path),false);
  assert.equal(await api.contacts(id),null);
  const guest=await cloudRoute(new Request('https://stage.invalid/studio/api/messages'),env);
  assert.equal(guest.status,401);
});

test('Cloudflare accepts inquiries and owner submissions while protecting unlisted contacts', async ()=>{
  const {env,send}=harness();
  const api=createApi(send);
  const form=fields=>{const value=new FormData();for(const [key,item] of Object.entries(fields))value.set(key,item);return value;};
  await api.sendForm(form({kind:'message',name:'QA',email:'qa@example.com',message:'Synthetic message.'}));
  await api.sendForm(form({kind:'property',name:'QA',email:'qa@example.com',phone:'1234',title:'Synthetic owner listing',offer:'rent',type:'Villa',location:'Rawai',price:'25000',description:'Synthetic owner property.'}));
  assert.equal((await api.messages()).length,1);
  const [pending]=await api.all();
  assert.equal(pending.status,'pending');
  assert.equal((await api.contacts(pending.id)).email,'qa@example.com');
  assert.equal((await api.search({})).count,0);
  const worker=makeWorker({'/index.html':'<!doctype html><title>Test</title>'});
  const empty=await worker.fetch(new Request('https://stage.invalid/api/submit',{method:'POST'}),env);
  assert.equal(empty.status,415);
  const blocked=await worker.fetch(new Request('https://stage.invalid/api/submit',{method:'POST'}),{...env,STAGING_READ_ONLY:'1'});
  assert.equal(blocked.status,503);
  const legacy=await worker.fetch(new Request('https://stage.invalid/?property='+pending.id),env);
  assert.equal(legacy.status,301);
});
