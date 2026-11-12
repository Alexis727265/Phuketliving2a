// Browser client. Only the publishable key is safe to expose here.
export function createClient({ url, publicKey, anonToken, fetch: send = globalThis.fetch }) {
  if (!url || !publicKey || !anonToken) throw new Error('Website services are not configured');
  let session = null;
  const call=async(path,{method='GET',token=anonToken,body,headers={}}={})=>{
    const result=await send(`${url}${path}`,{method,headers:{apikey:publicKey,authorization:`Bearer ${token}`,...headers},body});
    const data=result.status===204?null:await result.json().catch(()=>null);
    if(!result.ok){const message=data?.error_description || data?.msg || (typeof data?.error==='string'?data.error:null) || data?.message;const invalid=data?.error_code==='invalid_credentials'||/invalid login credentials/i.test(message||'');throw new Error(invalid?'Email or password is incorrect. Use your latest password; saved autofill may be outdated.':message||'Request failed. Please try again.');}
    return data;
  };
  const json=(body)=>({body:JSON.stringify(body),headers:{'content-type':'application/json'}});
  const adminToken=()=>{if(!session)throw new Error('Please sign in first');return session.access_token};
  const listingPath=id=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid listing');return '/rest/v1/pl2_properties?id=eq.'+id;};
  const changed=rows=>{if(!Array.isArray(rows)||rows.length!==1)throw new Error('Listing was not found or your session has expired. Refresh and sign in again.');return rows[0];};
  return {
    async listProperties(){ return call('/rest/v1/pl2_properties?select=*&status=eq.published&order=created_at.desc'); },
    async getProperty(id){const rows=await call('/rest/v1/pl2_properties?select=*&status=eq.published&id=eq.'+encodeURIComponent(id)+'&limit=1');return rows?.[0]||null;},
    async sendForm(form){return call('/functions/v1/pl2-submit',{method:'POST',body:form});},
    async login(email,password){
      email=email.trim().toLowerCase();
      const candidate=await call('/auth/v1/token?grant_type=password',{method:'POST',...json({email,password})});
      if(!candidate?.access_token||!candidate?.user?.id)throw new Error('Sign in failed');
      const rows=await call(`/rest/v1/pl2_admins?select=user_id&user_id=eq.${encodeURIComponent(candidate.user.id)}`,{token:candidate.access_token});
      if(!Array.isArray(rows)||!rows.length)throw new Error('This account is not an administrator');
      session=candidate;return {email:candidate.user.email};
    },
    logout(){session=null;},
    async changePassword(password){if(typeof password!=='string'||password.length<12)throw new Error('Use at least 12 characters');return call('/auth/v1/user',{method:'PUT',token:adminToken(),...json({password})});},
    async pending(){return call('/rest/v1/pl2_properties?select=*&status=eq.pending&order=created_at.desc',{token:adminToken()});},
    async allProperties(){return call('/rest/v1/pl2_properties?select=*&order=created_at.desc',{token:adminToken()});},
    async updateProperty(id,input){
      const token=adminToken();const path=listingPath(id);
      const payload={};
      for(const [key,max] of [['title',120],['location',100],['description',5000]]){const value=String(input[key]??'').trim();if(!value||value.length>max)throw new Error(`Check ${key} (1–${max} characters)`);payload[key]=value;}
      for(const [key,values] of Object.entries({offer:['rent','sale'],property_type:['Condo','Villa','House','Apartment','Land','Commercial'],price_period:['month','day','total'],status:['pending','published','rejected']})){if(!values.includes(input[key]))throw new Error(`Invalid ${key}`);payload[key]=input[key];}
      for(const key of ['price','bedrooms','bathrooms','size_sqm']){const raw=input[key];const value=raw==null||raw===''?null:Number(raw);if(key==='size_sqm'&&value===null){payload[key]=null;continue;}if(value===null||!Number.isFinite(value)||(key==='price'&&(value<=0||value>1e12))||(key==='size_sqm'&&value<=0)||(['bedrooms','bathrooms'].includes(key)&&(!Number.isInteger(value)||value<0||value>50)))throw new Error(`Invalid ${key}`);payload[key]=value;}
      if(!Array.isArray(input.features)||input.features.length>30||input.features.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw new Error('Invalid features');payload.features=[...new Set(input.features.map(x=>x.trim()))];
      const options=json(payload);options.headers.Prefer='return=representation';
      return changed(await call(path,{method:'PATCH',token,...options}));
    },
    async deleteProperty(id){
      const token=adminToken();const row=changed(await call(listingPath(id)+'&select=id,image_paths',{method:'DELETE',token,headers:{Prefer:'return=representation'}}));
      const paths=row.image_paths||[];
      if(!paths.length)return {cleanupFailed:false};
      // Only remove files belonging to the deleted listing; never trust a caller-supplied path.
      if(paths.some(path=>typeof path!=='string'||!path.startsWith(id+'/')||path.includes('..')))return {cleanupFailed:true};
      try{await call('/storage/v1/object/phuketliving2-images',{method:'DELETE',token,...json({prefixes:paths})});return {cleanupFailed:false};}catch{return {cleanupFailed:true};}
    },
    async messages(){return call('/rest/v1/pl2_messages?select=*&order=created_at.desc',{token:adminToken()});},
    async contacts(id){return call(`/rest/v1/pl2_property_contacts?select=*&property_id=eq.${encodeURIComponent(id)}`,{token:adminToken()});},
    async setStatus(id,status){if(!['published','rejected'].includes(status))throw new Error('Invalid status');return call(`/rest/v1/pl2_properties?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',token:adminToken(),...json({status})});},
    async acceptRecovery(token){const user=await call('/auth/v1/user',{token});if(!user?.id)throw new Error('Invalid recovery link');const rows=await call('/rest/v1/pl2_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{token});if(!rows?.length)throw new Error('This account is not an administrator');session={access_token:token,user};},
    async passwordReset(email,redirect){const endpoint='/auth/v1/recover'+(redirect?'?redirect_to='+encodeURIComponent(redirect):'');return call(endpoint,{method:'POST',...json({email:email.trim().toLowerCase()})});}
  };
}
