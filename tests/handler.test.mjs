import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../backend/handler.mjs';
const headers={'content-type':'application/json'};
function context(calls, {limit=false, failContact=false}={}) {return {url:'https://example.test',key:'secret-not-real',fetch:async(url,opt={})=>{
 calls.push({url,opt});
 if(url.endsWith('/rpc/pl2_reserve_submission'))return new Response(JSON.stringify(!limit),{status:200,headers});
 if(url.includes('/bucket/'))return new Response('{}',{status:200,headers});
 if(url.includes('/pl2_property_contacts')&&failContact)return new Response('{}',{status:500,headers});
 return new Response(null,{status:204});
}};}
const request=form=>new Request('https://example.test/submit',{method:'POST',body:form});
function property(){let f=new FormData();for(const [k,v] of Object.entries({kind:'property',title:'Condo',offer:'Rent',type:'Condo',location:'Surin',price:'40000',name:'Alex',email:'alex@example.com',phone:'0123',description:'Sunny',period:'Per month'}))f.set(k,v);return f;}
function jpeg(w,h){return new Uint8Array([255,216,255,192,0,8,8,h>>8,h&255,w>>8,w&255,1,255,217]);}
test('accepts a valid message only after admission',async()=>{let f=new FormData();for(const [k,v] of Object.entries({kind:'message',name:'A',email:'a@b.com',message:'Hello'}))f.set(k,v);const calls=[];let r=await handle(request(f),context(calls));assert.equal(r.status,200);assert.equal(calls.length,2);assert.match(calls[1].url,/pl2_messages/);});
test('refuses traffic above admission limit',async()=>{let f=property(),calls=[];let r=await handle(request(f),context(calls,{limit:true}));assert.equal(r.status,429);assert.equal(calls.length,1);});
test('submits a property and its photo and keeps contact information separate',async()=>{let f=property();f.append('photos',new Blob([jpeg(1920,1080)],{type:'image/jpeg'}),'photo.jpg');let calls=[];let r=await handle(request(f),context(calls));assert.equal(r.status,200);let p=JSON.parse(calls.find(x=>x.url.endsWith('/pl2_properties')).opt.body);assert.equal(p.image_paths.length,1);assert.equal(p.email,undefined);assert.equal(p.status,undefined);assert.match(calls.at(-1).url,/pl2_property_contacts/);});
test('rejects oversized photo dimensions and too many photos before writes',async()=>{let f=property();f.append('photos',new Blob([jpeg(3840,2160)],{type:'image/jpeg'}),'x.jpg');let calls=[];assert.equal((await handle(request(f),context(calls))).status,400);assert.equal(calls.length,0);f=property();for(let i=0;i<11;i++)f.append('photos',new Blob([jpeg(10,10)]),'x.jpg');assert.equal((await handle(request(f),context(calls))).status,400);assert.equal(calls.length,0);});
test('cleans up property and photos if private contact insert fails',async()=>{let f=property();f.append('photos',new Blob([jpeg(100,100)]),'x.jpg');let calls=[];assert.equal((await handle(request(f),context(calls,{failContact:true}))).status,503);assert.ok(calls.some(x=>x.opt.method==='DELETE'&&x.url.includes('/pl2_properties?')));assert.ok(calls.some(x=>x.opt.method==='DELETE'&&x.url.includes('/storage/v1/object/')));});
