export function propertyLink(id, base) {const link=new URL('/',base);link.searchParams.set('property',id);return link.href;}
export function listingIdFromUrl(address){const value=new URL(address).searchParams.get('property');return value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null;}
export async function shareListing(property,base,browser){
 const link=propertyLink(property.id,base),data={title:property.title,text:'View this property on Phuket Living',url:link};
 if(browser.share&&(!browser.canShare||browser.canShare(data))){try{await browser.share(data);return {status:'shared',link};}catch(error){if(error?.name==='AbortError')return {status:'cancelled',link};}}
 try{if(browser.clipboard?.writeText){await browser.clipboard.writeText(link);return {status:'copied',link};}}catch{}
 return {status:'manual',link};
}
