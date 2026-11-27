import {validVideoPath} from '../video.mjs';
export function validate(p,id){
  const row={};for(const [field,max] of [['title',120],['location',100],['description',5000]]){row[field]=String(p[field]||'').trim();if(!row[field]||row[field].length>max)throw Error(`Please check ${field}. Maximum ${max} characters.`);}
  for(const [key,allowed] of Object.entries({offer:['rent','sale'],property_type:['Condo','Villa','House','Apartment','Land','Commercial'],price_period:['month','day','total'],status:['pending','published','rejected']})){if(!allowed.includes(p[key]))throw Error('Please check '+key);row[key]=p[key];}
  for(const key of ['price','bedrooms','bathrooms','size_sqm']){const n=p[key]===''||p[key]==null?null:Number(p[key]);if(key==='size_sqm'&&n===null){row[key]=null;continue;}if(n===null||!Number.isFinite(n)||(key==='price'&&(n<=0||n>1e12))||(key==='size_sqm'&&n<=0)||(['bedrooms','bathrooms'].includes(key)&&(!Number.isInteger(n)||n<0||n>50)))throw Error('Please check '+key);row[key]=n;}
  if(!Array.isArray(p.features)||p.features.length>30||p.features.some(x=>typeof x!=='string'||x.length>100))throw Error('Please check amenities');
  row.features=[...new Set(p.features.map(x=>x.trim()).filter(Boolean))];
  if(!Array.isArray(p.image_paths)||p.image_paths.length>10||new Set(p.image_paths).size!==p.image_paths.length||p.image_paths.some(x=>typeof x!=='string'||x.includes('..')||!/^[-a-f0-9]{36}\/[a-zA-Z0-9._-]+$/.test(x)))throw Error('Please check the property photos. Maximum 10.');
  if(p.video_path!==undefined){
   if(p.video_path!==null&&!validVideoPath(p.video_path,id))throw Error('The video does not belong to this property.');
   row.video_path=p.video_path;
  }
  row.image_paths=p.image_paths;row.featured=Boolean(p.featured);row.details=p.details&&typeof p.details==='object'&&!Array.isArray(p.details)?p.details:{};return row;
 }
