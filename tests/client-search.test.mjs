import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesProperty } from '../backend/search.mjs';
import { createClient } from '../backend/client.mjs';
const p={offer:'rent',location:'Surin',property_type:'Condo',price:40000,bedrooms:1,bathrooms:1,size_sqm:45,features:['Sea view']};
test('filters by area, type, offer, price, size, bedrooms, bathrooms and features',()=>{
 assert.equal(matchesProperty(p,{offer:'rent',location:'surin',type:'Condo',min:30000,max:50000,beds:'1',baths:'1',size:'40',feature:'Sea view'}),true);
 for(const f of [{offer:'sale'},{location:'Rawai'},{type:'Villa'},{max:'30000'},{min:'50000'},{beds:'2'},{beds:'0'},{baths:'2'},{size:'50'},{feature:'Pool'}])assert.equal(matchesProperty(p,f),false);
 assert.equal(matchesProperty({...p,bedrooms:0},{beds:'0'}),true);
});
test('admin operations require confirmed membership and keep tokens in memory',async()=>{
 const calls=[];const fake=async(url,opts)=>{calls.push({url,opts});if(url.includes('/auth/v1/'))return Response.json({access_token:'fake-token',user:{id:'user-id',email:'admin@example.com'}});if(url.includes('pl2_admins'))return Response.json([{user_id:'user-id'}]);return Response.json([])};
 const client=createClient({url:'https://example.test',publicKey:'test-public',anonToken:'test-anon',fetch:fake});
 await assert.rejects(client.messages(),/sign in/);
 await client.login('admin@example.com','example-password');await client.messages();
 assert.equal(calls.at(-1).opts.headers.authorization,'Bearer fake-token');client.logout();await assert.rejects(client.pending(),/sign in/);
});
test('rejects accounts without admin membership',async()=>{
 const fake=async(url)=>url.includes('/auth/v1/')?Response.json({access_token:'fake',user:{id:'unapproved'}}):Response.json([]);
 const client=createClient({url:'https://example.test',publicKey:'public',anonToken:'anon',fetch:fake});
 await assert.rejects(client.login('a@b.com','example'),/not an administrator/);await assert.rejects(client.messages(),/sign in/);
});
test('shows Supabase invalid-password errors clearly and normalizes email',async()=>{let body;const client=createClient({url:'https://example.test',publicKey:'public',anonToken:'anon',fetch:async(url,options)=>{body=JSON.parse(options.body);return Response.json({code:400,msg:'Invalid login credentials'},{status:400});}});await assert.rejects(client.login(' Admin@Example.com ','password with spaces '),/Email or password is incorrect/);assert.equal(body.email,'admin@example.com');assert.equal(body.password,'password with spaces ');});
test('recovery verifies user and admin membership before changing password',async()=>{let updates=0;const send=async(url,options)=>{if(url.endsWith('/auth/v1/user')&&options.method==='GET')return Response.json({id:'owner'});if(url.includes('/pl2_admins'))return Response.json([{user_id:'owner'}]);if(options.method==='PUT'){updates++;assert.equal(options.headers.authorization,'Bearer recovery-token');return Response.json({id:'owner'});}throw Error('Unexpected call')};const client=createClient({url:'https://example.test',publicKey:'public',anonToken:'anon',fetch:send});await assert.rejects(client.changePassword('a-long-new-password'),/sign in/);await client.acceptRecovery('recovery-token');await client.changePassword('a-long-new-password');assert.equal(updates,1);});
test('recovery refuses non-administrators',async()=>{const send=async url=>url.includes('/pl2_admins')?Response.json([]):Response.json({id:'not-admin'});const client=createClient({url:'https://example.test',publicKey:'public',anonToken:'anon',fetch:send});await assert.rejects(client.acceptRecovery('token'),/not an administrator/);await assert.rejects(client.changePassword('a-long-new-password'),/sign in/);});

const listingId='12345678-1234-4234-8234-123456789abc';
const edited={title:'Updated villa',location:'Bang Tao',description:'Updated description',offer:'rent',property_type:'Villa',price_period:'month',status:'published',price:'90000',bedrooms:'3',bathrooms:'2',size_sqm:'250',features:['Pool','Sea view']};
function managementClient({rows=[{id:listingId,image_paths:[listingId+'/1.jpg']}],storageFails=false}={}){
 const calls=[];const client=createClient({url:'https://example.test',publicKey:'public',anonToken:'anon',fetch:async(url,options)=>{
  calls.push({url,options});if(url.includes('/auth/v1/'))return Response.json({access_token:'admin-token',user:{id:'admin'}});if(url.includes('/pl2_admins'))return Response.json([{user_id:'admin'}]);if(url.includes('/storage/'))return storageFails?Response.json({message:'Storage unavailable'},{status:503}):Response.json([]);return Response.json(rows);
 }});return {client,calls};
}
test('listing management requires sign in, targets a single UUID and preserves photos',async()=>{
 const {client,calls}=managementClient();await assert.rejects(client.allProperties(),/sign in/);await assert.rejects(client.updateProperty(listingId,edited),/sign in/);await assert.rejects(client.deleteProperty(listingId),/sign in/);
 await client.login('admin@example.com','test');await client.allProperties();assert.ok(!calls.at(-1).url.includes('status=eq.pending'));
 await client.updateProperty(listingId,{...edited,id:'other',image_paths:[],created_at:'fake'});const request=calls.at(-1);assert.equal(request.options.method,'PATCH');assert.equal(request.options.headers.authorization,'Bearer admin-token');assert.equal(request.options.headers.Prefer,'return=representation');assert.ok(request.url.endsWith('id=eq.'+listingId));const payload=JSON.parse(request.options.body);assert.equal(payload.price,90000);assert.equal(payload.size_sqm,250);assert.ok(!('image_paths' in payload));assert.ok(!('id' in payload));
 const count=calls.length;await assert.rejects(client.deleteProperty('x&or=(id.not.is.null)'),/Invalid listing/);assert.equal(calls.length,count);
});
test('editing rejects invalid data before sending a mutation',async()=>{
 const {client,calls}=managementClient();await client.login('admin@example.com','test');for(const change of [{price:-1},{price:Infinity},{bedrooms:1.5},{bathrooms:51},{size_sqm:0},{status:'anything'},{description:''},{features:['']},{property_type:'Unknown'}])await assert.rejects(client.updateProperty(listingId,{...edited,...change}));assert.equal(calls.length,2);
});
test('missing or unauthorized rows are never reported as saved or deleted',async()=>{
 const {client,calls}=managementClient({rows:[]});await client.login('admin@example.com','test');await assert.rejects(client.updateProperty(listingId,edited),/not found/);await assert.rejects(client.deleteProperty(listingId),/not found/);assert.ok(!calls.some(x=>x.url.includes('/storage/')));
});
test('deletion uses returned image paths after database confirmation and reports cleanup failures',async()=>{
 for(const storageFails of [false,true]){const {client,calls}=managementClient({storageFails});await client.login('admin@example.com','test');const result=await client.deleteProperty(listingId);assert.equal(result.cleanupFailed,storageFails);assert.equal(calls.at(-2).options.method,'DELETE');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{prefixes:[listingId+'/1.jpg']});}
 const {client,calls}=managementClient({rows:[{id:listingId,image_paths:['another-listing/1.jpg']}]});await client.login('admin@example.com','test');assert.equal((await client.deleteProperty(listingId)).cleanupFailed,true);assert.ok(!calls.some(x=>x.url.includes('/storage/')));
});
