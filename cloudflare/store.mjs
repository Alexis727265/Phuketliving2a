import {areaPattern, canonicalArea, isCatalogueArea} from '../areas.mjs';

export function decode(row) {
  if (!row) return null;
  const result = {...row};
  for (const key of ['features','image_paths','details']) if (key in result) result[key] = JSON.parse(result[key]);
  for (const key of ['featured','is_read']) if (key in result) result[key] = Boolean(result[key]);
  return result;
}
export function encode(value) {
  if (typeof value === 'boolean') return Number(value);
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
}
export function insert(db,table,record) {
  const keys = Object.keys(record);
  return db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...Object.values(record).map(encode));
}
export const rows = async statement => (await statement.all()).results.map(decode);
export const property = async (db,id,admin=false) => decode(await db.prepare('SELECT * FROM pl2_properties WHERE id=?'+(admin?'':" AND status='published'")).bind(id).first());

export async function search(db,p) {
  const clauses = ["status='published'"], args = [];
  const add = (condition,...bound) => {clauses.push(condition);args.push(...bound);};
  for (const [name,col] of [['offer','offer'],['type','property_type'],['period','price_period']]) if (p[name]) add(col+'=?',String(p[name]));
  if (p.min || p.max || ['price-asc','price-desc'].includes(p.sort)) add('price>=100');
  for (const [name,col] of [['min','price'],['max','price'],['beds','bedrooms'],['baths','bathrooms'],['size','size_sqm'],['land',"json_extract(details,'$.land_sqm')"],['guests',"json_extract(details,'$.max_guests')"]]) {
    if (p[name] === undefined || p[name] === null || p[name] === '' || !Number.isFinite(Number(p[name]))) continue;
    add(col+(name==='max'?'<=?':name==='beds'&&Number(p.beds)===0?'=?':'>=?'),Number(p[name]));
  }
  if (p.term) add("json_extract(details,'$.rental_term')=?",String(p.term));
  if (p.now) add("json_extract(details,'$.available_now')=1 AND json_extract(details,'$.availability_confirmed_on')>=?",new Date(Date.now()-30*86400000).toISOString().slice(0,10));
  for (const feature of (Array.isArray(p.features)?p.features:[]).slice(0,30)) add('EXISTS (SELECT 1 FROM json_each(features) WHERE value=?)',String(feature));
  if (Array.isArray(p.ids)) add('id IN (SELECT value FROM json_each(?))',JSON.stringify(p.ids));
  if (Array.isArray(p.areas) && p.areas.length) {
    const names=p.areas.slice(0,150).map(a=>canonicalArea(String(a)));
    const source=areaPattern(names).replaceAll('[[:space:][:punct:]]*','[^\\p{L}\\p{N}]*').replaceAll('[^[:alnum:]]','[^\\p{L}\\p{N}]');
    const re=source?new RegExp(source,'iu'):null;
    const exact=new Set(names.filter(a=>!isCatalogueArea(a)));
    const locations=(await db.prepare("SELECT DISTINCT location FROM pl2_properties WHERE status='published'").all()).results;
    const matching=locations.map(x=>x.location).filter(a=>exact.has(a)||re?.test(a));
    add('location IN (SELECT value FROM json_each(?))',JSON.stringify(matching));
  }
  const term=String(p.q||'').replace(/[*,().%_\\"'{}\[\]]/g,' ').trim().slice(0,100);
  if (term) add('(instr(lower(title),lower(?)) OR instr(lower(location),lower(?)) OR instr(lower(description),lower(?)) OR id=?)',term,term,term,term);
  const where=' FROM pl2_properties WHERE '+clauses.join(' AND ');
  const order=({'price-asc':'price ASC','price-desc':'price DESC'})[p.sort]||'created_at DESC';
  const limit=Math.max(1,Math.min(100,Number.parseInt(p.limit)||12)), page=Math.max(1,Math.min(100000,Number.parseInt(p.page)||1));
  const [count,list]=await db.batch([db.prepare('SELECT count(*) AS n'+where).bind(...args),db.prepare('SELECT *'+where+' ORDER BY '+order+',id ASC LIMIT ? OFFSET ?').bind(...args,limit,(page-1)*limit)]);
  return {count:count.results[0].n,rows:list.results.map(decode)};
}
