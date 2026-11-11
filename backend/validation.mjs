// Validation shared by the future submission endpoint. No secrets belong here.
const offers = new Set(['rent', 'sale']);
const types = new Set(['Condo', 'Villa', 'House', 'Apartment', 'Land', 'Commercial']);
function text(input, label, max) {
  if (typeof input !== 'string') throw new Error(`${label} is required`);
  const result = input.trim();
  if (!result || result.length > max) throw new Error(`${label} must contain 1–${max} characters`);
  return result;
}
function whole(input, label, max) {
  if (input === '' || input == null) return 0;
  const result = Number(input);
  if (!Number.isInteger(result) || result < 0 || result > max) throw new Error(`${label} is invalid`);
  return result;
}
export function validateProperty(input, photos) {
  if (!input || typeof input !== 'object') throw new Error('Property details are required');
  if (!Array.isArray(photos) || photos.length > 10) throw new Error('Select up to ten images');
  const offer = text(input.offer, 'Listing type', 10).toLowerCase();
  const type = text(input.type, 'Property type', 30);
  const price = Number(input.price);
  if (!offers.has(offer) || !types.has(type)) throw new Error('Choose a valid listing and property type');
  if (!Number.isFinite(price) || price <= 0 || price > 1e12) throw new Error('Price is invalid');
  const email = text(input.email, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email');
  return {title:text(input.title,'Title',120),offer,type,location:text(input.location,'Area',100),price,
    bedrooms:whole(input.bedrooms,'Bedrooms',50),bathrooms:whole(input.bathrooms,'Bathrooms',50),
    description:text(input.description,'Description',5000),name:text(input.name,'Name',100),
    email,phone:text(input.phone,'Phone',40)};
}
// Read JPEG SOF markers, not the untrusted filename or MIME type.
export function validateJpeg(bytes, maxBytes = 3_000_000) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > maxBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Image must be a JPEG under 3 MB');
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Malformed JPEG');
    let marker = bytes[offset++];
    while (marker === 0xff && offset < bytes.length) marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const len = (bytes[offset] << 8) | bytes[offset + 1];
    if (len < 2 || offset + len > bytes.length) throw new Error('Malformed JPEG');
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (len < 8) throw new Error('Malformed JPEG');
      const height=(bytes[offset+3]<<8)|bytes[offset+4], width=(bytes[offset+5]<<8)|bytes[offset+6];
      if (!width || !height || Math.max(width,height)>1920 || Math.min(width,height)>1080) throw new Error('Image must fit within 1080p');
      return { width, height };
    }
    offset += len;
  }
  throw new Error('JPEG dimensions not found');
}
