import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProperty, validateJpeg } from '../backend/validation.mjs';
const valid={title:'Beach condo',offer:'rent',type:'Condo',location:'Surin',price:'40000',bedrooms:'1',bathrooms:'1',description:'Sea view',name:'Alex',email:'alex@example.com',phone:'0123456789'};
function jpeg(w,h){return new Uint8Array([255,216,255,192,0,8,8,h>>8,h&255,w>>8,w&255,1,255,217]);}
test('validates property input and enforces ten image limit',()=>{assert.equal(validateProperty(valid,Array(10).fill(null)).price,40000);assert.throws(()=>validateProperty(valid,Array(11).fill(null)));assert.throws(()=>validateProperty({...valid,price:-1},[]));assert.throws(()=>validateProperty({...valid,email:'no-at'},[]));});
test('checks JPEG bytes and maximum dimensions',()=>{assert.deepEqual(validateJpeg(jpeg(1920,1080)),{width:1920,height:1080});assert.deepEqual(validateJpeg(jpeg(1080,1920)),{width:1080,height:1920});assert.throws(()=>validateJpeg(jpeg(3840,2160)));assert.throws(()=>validateJpeg(new Uint8Array([1,2,3])));});
