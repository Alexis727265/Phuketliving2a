import {createRemoteJWKSet,jwtVerify} from 'jose';
const issuer='https://phuketliving-aleroy953.cloudflareaccess.com';
const keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
export async function adminIdentity(request,env) {
  const token=request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_AUD) return null;
  let payload;
  try { ({payload}=await jwtVerify(token,keys,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','email']})); }
  catch {return null;}
  if(typeof payload.email!=='string')return null;
  return env.DB.prepare('SELECT user_id FROM pl2_admin_identities WHERE email=?').bind(payload.email).first();
}
