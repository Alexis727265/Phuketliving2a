// Browser client. Only the publishable key is safe to expose here.
export function createClient({ url, publicKey, anonToken, fetch: send = globalThis.fetch }) {
  if (!url || !publicKey || !anonToken) throw new Error('Website services are not configured');
  let session = null;
  const call=async(path,{method='GET',token=anonToken,body,headers={}}={})=>{
    const result=await send(`${url}${path}`,{method,headers:{apikey:publicKey,authorization:`Bearer ${token}`,...headers},body});
    const data=result.status===204?null:await result.json().catch(()=>null);
    if(!result.ok)throw new Error(data?.error_description || data?.error || 'Request failed. Please try again.');
    return data;
  };
  const json=(body)=>({body:JSON.stringify(body),headers:{'content-type':'application/json'}});
  const adminToken=()=>{if(!session)throw new Error('Please sign in first');return session.access_token};
  return {
    async listProperties(){ return call('/rest/v1/pl2_properties?select=*&status=eq.published&order=created_at.desc'); },
    async getProperty(id){const rows=await call('/rest/v1/pl2_properties?select=*&status=eq.published&id=eq.'+encodeURIComponent(id)+'&limit=1');return rows?.[0]||null;},
    async sendForm(form){return call('/functions/v1/pl2-submit',{method:'POST',body:form});},
    async login(email,password){
      const candidate=await call('/auth/v1/token?grant_type=password',{method:'POST',...json({email,password})});
      if(!candidate?.access_token||!candidate?.user?.id)throw new Error('Sign in failed');
      const rows=await call(`/rest/v1/pl2_admins?select=user_id&user_id=eq.${encodeURIComponent(candidate.user.id)}`,{token:candidate.access_token});
      if(!Array.isArray(rows)||!rows.length)throw new Error('This account is not an administrator');
      session=candidate;return {email:candidate.user.email};
    },
    logout(){session=null;},
    async changePassword(password){if(typeof password!=='string'||password.length<12)throw new Error('Use at least 12 characters');return call('/auth/v1/user',{method:'PUT',token:adminToken(),...json({password})});},
    async pending(){return call('/rest/v1/pl2_properties?select=*&status=eq.pending&order=created_at.desc',{token:adminToken()});},
    async messages(){return call('/rest/v1/pl2_messages?select=*&order=created_at.desc',{token:adminToken()});},
    async contacts(id){return call(`/rest/v1/pl2_property_contacts?select=*&property_id=eq.${encodeURIComponent(id)}`,{token:adminToken()});},
    async setStatus(id,status){if(!['published','rejected'].includes(status))throw new Error('Invalid status');return call(`/rest/v1/pl2_properties?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',token:adminToken(),...json({status})});},
    async passwordReset(email){return call('/auth/v1/recover',{method:'POST',...json({email})});}
  };
}
