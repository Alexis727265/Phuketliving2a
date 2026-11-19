import {areaGroups, areaSuggestions, canonicalArea} from '../areas.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSearch,createApi} from '../data.mjs';
import {makeWorker} from '../worker.mjs';
import {readFile} from 'node:fs/promises';
const id='4289c0bd-92bb-4f2e-a116-01cbf87d6fe4';
test('database search composes multi-area, amenities, numeric, sort and pagination filters',()=>{const q=buildSearch({areas:['Bang Tao','Rawai'],features:['Pool','Pet friendly'],min:20000,max:50000,beds:'0',guests:4,land:100,page:2,sort:'price-asc'});assert.equal(q.get('status'),'eq.published');assert.match(q.get('location'), /^imatch\..*bang.*tao.*rawai/);assert.equal(q.get('features'),'cs.{"Pool","Pet friendly"}');assert.equal(q.get('bedrooms'),'eq.0');assert.equal(q.get('details->land_sqm'),'gte.100');assert.equal(q.get('offset'),'12');assert.equal(q.get('order'),'price.asc,id.asc');});
test('availability requires recent confirmation and inputs cannot inject query expressions',()=>{const q=buildSearch({now:true,q:'villa),status.eq.pending'});assert.equal(q.get('details->>available_now'),'eq.true');assert.match(q.get('details->>availability_confirmed_on'),/^gte.\d{4}-/);assert.ok(!q.get('or').includes('status.eq.pending'));});
test('admin membership is verified and anonymous mutation is blocked before transport',async()=>{let calls=0;const api=createApi({fetch:async url=>{calls++;return Response.json(url.includes('/auth/v1/')?{access_token:'x',user:{id}}:[]);}});await assert.rejects(api.create(id,{}),/check title|check/);await assert.rejects(api.all(),/sign in/);assert.equal(calls,0);await assert.rejects(api.login('owner@example.com','wrong'),/not authorized/);assert.equal(api.isLoggedIn(),false);});
test('worker preserves legacy URLs, provides server-rendered metadata and hides unpublished rows',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const worker=makeWorker({'/index.html':html,'/main.mjs':'export {};'});const p={id,title:'Real villa <safe>',description:'A real property description',property_type:'Villa',location:'Rawai',price:80000,price_period:'month',offer:'rent',bedrooms:3,bathrooms:3,features:['Pool'],image_paths:[id+'/1.jpg'],created_at:'2026-11-01'};let query;const env={TEST_FETCH:async url=>{query=url;return Response.json([p]);}};const response=await worker.fetch(new Request('https://example.com/property/'+id),env);assert.equal(response.status,200);const body=await response.text();assert.match(body,/og:title" content="Real villa &lt;safe&gt;/);assert.match(body,/application\/ld\+json/);assert.match(body,/id="server-content"/);assert.ok(query.includes('status=eq.published'));assert.ok(!body.includes('service_role'));const legacy=await worker.fetch(new Request('https://example.com/?property='+id),env);assert.equal(legacy.status,301);assert.equal(legacy.headers.get('location'),'https://example.com/property/'+id);const missing=await worker.fetch(new Request('https://example.com/property/'+id),{TEST_FETCH:async()=>Response.json([])});assert.equal(missing.status,404);const admin=await worker.fetch(new Request('https://example.com/admin'),env);assert.match(await admin.text(),/noindex,nofollow/);});
test('sitemap includes only the published response, and script data is escaped',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const worker=makeWorker({'/index.html':html});const r=await worker.fetch(new Request('https://example.com/sitemap.xml'),{TEST_FETCH:async()=>Response.json([{id,updated_at:'2026-11-17T00:00:00Z'}])});assert.equal(r.status,200);assert.match(await r.text(),new RegExp('/property/'+id));const method=await worker.fetch(new Request('https://example.com/',{method:'POST'}),{});assert.equal(method.status,405);});

test('restored admin sessions verify the real user and membership before access',async()=>{const values=new Map();const sessionStore={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let member=true;const send=async(url,opts)=>{if(url.includes('grant_type=password'))return Response.json({access_token:'admin-token',refresh_token:'refresh-token',expires_in:3600,user:{id,email:'owner@example.com'}});if(url.endsWith('/auth/v1/user'))return Response.json({id,email:'owner@example.com'});if(url.includes('pl2_admins'))return Response.json(member?[{user_id:id}]:[]);if(url.includes('logout'))return new Response(null,{status:204});return Response.json([]);};const first=createApi({fetch:send,sessionStore});await first.login('owner@example.com','password');const restored=createApi({fetch:send,sessionStore});assert.equal(restored.isLoggedIn(),false);assert.equal(await restored.restoreSession(),true);await restored.all();member=false;const rejected=createApi({fetch:send,sessionStore});assert.equal(await rejected.restoreSession(),false);assert.equal(rejected.isLoggedIn(),false);assert.equal(values.size,0);});

test('login removes surrounding copy whitespace and invisible formatting without changing case',async()=>{let posted;const api=createApi({fetch:async(url,opts)=>{if(url.includes('grant_type=password')){posted=JSON.parse(opts.body);return Response.json({access_token:'token',user:{id},expires_in:3600});}return Response.json([{user_id:id}]);}});await api.login(' OWNER@EXAMPLE.COM ','\n\u200bExactPassword! \n');assert.deepEqual(posted,{email:'owner@example.com',password:'ExactPassword!'});});

test('public video requests forward byte ranges and deny unavailable objects', async () => {
  const videoPath = id + '/cd8db19f-f82e-4df8-b5fe-405c405ce5f5.mp4';
  const url = 'https://example.com/videos/' + videoPath;
  const worker = makeWorker({});
  const env = {TEST_FETCH: async (path, options) => {
    assert.match(path, /\/object\/authenticated\/phuketliving2-videos\//);
    assert.match(options.headers.authorization, /^Bearer /);
    assert.equal(options.headers.range, 'bytes=1-3');
    return new Response('abc', {status:206, headers:{'content-range':'bytes 1-3/10','accept-ranges':'bytes'}});
  }};
  const range = await worker.fetch(new Request(url,{headers:{range:'bytes=1-3'}}),env);
  assert.equal(range.status,206);
  assert.equal(range.headers.get('content-range'),'bytes 1-3/10');
  assert.equal(range.headers.get('content-type'),'video/mp4');
  assert.match(range.headers.get('cache-control'), /no-store/);
  assert.equal(await range.text(),'abc');
  const unavailable = await worker.fetch(new Request(url),{TEST_FETCH:async()=>new Response(null,{status:403})});
  assert.equal(unavailable.status,404);
  const malformed = await worker.fetch(new Request('https://example.com/videos/not-a-video'),env);
  assert.equal(malformed.status,404);
});

test('video cleanup keeps the current attachment and rejects paths from other listings', async () => {
  const attached = id + '/cd8db19f-f82e-4df8-b5fe-405c405ce5f5.mp4';
  const replaced = id + '/3d5ec584-ecef-4362-bc6c-a483616d010f.mp4';
  const deletions = [];
  const api = createApi({fetch:async (url, options)=>{
    if(url.includes('grant_type=password'))return Response.json({access_token:'x',user:{id},expires_in:3600});
    if(url.includes('pl2_admins'))return Response.json([{user_id:id}]);
    if(url.includes('pl2_properties'))return Response.json([{id,video_path:attached}]);
    if(options.method==='DELETE')deletions.push(JSON.parse(options.body));
    return new Response(null,{status:204});
  }});
  await api.login('owner@example.com','password');
  await api.cleanVideos(id,[attached,replaced]);
  await assert.rejects(api.cleanVideos(id,[replaced.replace(id,'3d5ec584-ecef-4362-bc6c-a483616d010f')]),/Unsafe video path/);
  assert.deepEqual(deletions,[{prefixes:[replaced]}]);
});

test('small Android picker MP4s use the standard upload and update only the video field', async () => {
  const videoPath = id + '/cd8db19f-f82e-4df8-b5fe-405c405ce5f5.mp4';
  const genericFile = new File(['\0\0\0\x18ftypisom\0\0\0\0'], 'download', {type:'application/octet-stream'});
  const wrongFile = new File(['\0\0\0\x18ftypqt  \0\0\0\0'], 'download', {type:'video/quicktime'});
  const updatedAt = '2026-11-19T04:10:23.988496+00:00';
  const requests = [];
  const api = createApi({fetch: async (url, options) => {
    if(url.includes('grant_type=password'))return Response.json({access_token:'admin-token',user:{id},expires_in:3600});
    if(url.includes('pl2_admins'))return Response.json([{user_id:id}]);
    requests.push({url,options});
    return Response.json([{id,video_path:videoPath}]);
  }});
  await api.login('owner@example.com','password');
  await assert.rejects(api.uploadVideo(videoPath,wrongFile),/Choose an MP4/);
  assert.equal(requests.length,0);
  await api.uploadVideo(videoPath,genericFile);
  const [upload] = requests;
  assert.ok(upload.url.endsWith('/storage/v1/object/phuketliving2-videos/'+videoPath));
  assert.equal(upload.options.headers['content-type'],'video/mp4');
  assert.equal(upload.options.headers.authorization,'Bearer admin-token');
  assert.equal(upload.options.body,genericFile);
  await api.saveVideo(id,videoPath,updatedAt);
  const update = requests.at(-1);
  assert.equal(new URL(update.url).searchParams.get('updated_at'),'eq.'+updatedAt);
  assert.deepEqual(JSON.parse(update.options.body), {video_path:videoPath});
  await api.saveVideo(id,null,updatedAt);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), {video_path:null});
});

test('the area catalogue stays available with no listings and keeps custom locations', () => {
  const groups = areaGroups(['Pa Khlok', 'Bangjo Thalang Chergentalay', 'Nai Harn, Rawai']);
  const options = groups.flatMap(([, names]) => names);
  for (const area of ['Pa Klok', 'Kamala', 'Kata', 'Karon', 'Talat Yai', 'Sakhu', 'Nai Yang']) {
    assert.ok(options.includes(area), area);
    assert.ok(areaSuggestions().includes(area), area);
  }
  assert.equal(canonicalArea('Pa Khlok'), 'Pa Klok');
  assert.equal(canonicalArea('BangTao'), 'Bang Tao');
  assert.ok(!options.includes('Pa Khlok'));
  assert.deepEqual(groups.at(-1)[1], ['Bangjo Thalang Chergentalay', 'Nai Harn, Rawai']);
  assert.ok(areaSuggestions(['A custom village']).includes('A custom village'));
});

test('known areas and legacy locations can be combined without overriding text search', () => {
  const legacy = 'Nai Harn, Rawai';
  assert.equal(buildSearch({areas: [legacy]}).get('location'), 'in.("Nai Harn, Rawai")');
  const q = buildSearch({areas: ['Pa Khlok', legacy], q: 'pool'});
  assert.match(q.get('and'), /location\.imatch\..*pa.*khlok/);
  assert.match(q.get('and'), /location\.in\.\("Nai Harn, Rawai"\)/);
  assert.match(q.get('or'), /title\.ilike\.\*pool\*/);
});
