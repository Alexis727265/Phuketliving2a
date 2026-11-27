import {validate} from './listing.mjs';
import {validVideoPath,validateVideoFile} from '../video.mjs';
export const imageUrl = path => path ? '/images/'+path.split('/').map(encodeURIComponent).join('/') : '';
const chunkSize = 8 * 1024 * 1024;
export function createApi(send = globalThis.fetch) {
  let loggedIn = false;
  async function call(path, {method = 'GET', data, body, type, admin = false, signal} = {}) {
    const headers = {};
    if (admin) headers['x-phuket-admin'] = '1';
    if (data !== undefined) { body = JSON.stringify(data); type = 'application/json'; }
    if (type) headers['content-type'] = type;
    const res = await send((admin ? '/studio/api/' : '/api/') + path, {method, headers, body, signal});
    const value = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Error(value?.error || 'Unable to complete the request.');
    return value;
  }
  const manage = (path, opts = {}) => call(path, {...opts, admin:true});
  const idsafe = id => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error('Invalid property reference.');
    return id;
  };
  const rowPath = id => 'properties/' + idsafe(id);
  return {
    async restoreSession() {
      if (location.pathname !== '/studio' && location.pathname !== '/studio/') return false;
      try { loggedIn = Boolean((await manage('session')).user_id); } catch { loggedIn = false; }
      return loggedIn;
    },
    isLoggedIn() { return loggedIn; },
    logout() { loggedIn = false; location.assign('/cdn-cgi/access/logout'); },
    search(params, {signal} = {}) { return call('search', {method:'POST', data:params, signal}); },
    facets() { return call('facets'); },
    highlights() { return call('highlights'); },
    get(id, {admin = false} = {}) { return admin ? manage(rowPath(id)) : call(rowPath(id)); },
    all() { return manage('properties'); },
    messages() { return manage('messages'); },
    contacts(id) { return manage('contacts/' + idsafe(id)); },
    saveContact(id, {name,email,phone}) { return manage('contacts/' + idsafe(id), {method:'PUT',data:{name:name||null,email:email||null,phone:phone||null}}); },
    create(id,p) { return manage(rowPath(id), {method:'POST',data:{row:validate(p,id)}}); },
    save(id,p,expectedUpdatedAt) { return manage(rowPath(id), {method:'PATCH',data:{row:validate(p,id),expectedUpdatedAt}}); },
    saveVideo(id,video_path,expectedUpdatedAt) { return manage(rowPath(id), {method:'PATCH',data:{row:{video_path},expectedUpdatedAt}}); },
    setStatus(id,status) { return manage(rowPath(id), {method:'PATCH',data:{row:{status}}}); },
    delete(id) { return manage(rowPath(id), {method:'DELETE'}); },
    async upload(id,blob) {
      const path = idsafe(id) + '/' + crypto.randomUUID() + '.jpg';
      await manage('images/' + path, {method:'PUT',body:blob,type:'image/jpeg'});
      return path;
    },
    cleanImages(id,paths) { return paths.length ? manage('cleanup/' + idsafe(id), {method:'POST',data:{kind:'images',paths}}) : Promise.resolve(); },
    cleanVideos(id,paths) { return paths.length ? manage('cleanup/' + idsafe(id), {method:'POST',data:{kind:'videos',paths}}) : Promise.resolve(); },
    async uploadVideo(path,file,onProgress) {
      if (!validVideoPath(path)) throw Error('Invalid video path.');
      await validateVideoFile(file);
      const dest = 'uploads/' + path;
      const state = await manage(dest,{method:'POST',data:{size:file.size}});
      if (state.complete) { onProgress?.(100); return; }
      const parts = [];
      let saved = {};
      const key = 'pl2-upload:' + state.uploadId;
      try { saved = JSON.parse(sessionStorage.getItem(key)) || {}; } catch {}
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const number = parts.length + 1;
        if (!saved[number]) {
          const piece = file.slice(offset,offset+chunkSize);
          let attempt = 0;
          for (;;) {
            try {
              saved[number] = await manage(dest+'?part='+number, {method:'PUT',body:piece,type:'application/octet-stream'});
              break;
            } catch (error) { if (++attempt >= 3) throw error; await new Promise(r=>setTimeout(r,attempt*1000)); }
          }
          try { sessionStorage.setItem(key,JSON.stringify(saved)); } catch {}
        }
        parts.push(saved[number]);
        onProgress?.(Math.round(Math.min(file.size,offset+chunkSize)*99/file.size));
      }
      await manage(dest,{method:'PATCH',data:{parts}});
      try { sessionStorage.removeItem(key); } catch {}
      onProgress?.(100);
    },
    async videoPreview(path) { return (await manage('preview/'+path, {method:'POST'})).url; },
    sendForm(form) { return call('submit', {method:'POST',body:form}); },
  };
}
