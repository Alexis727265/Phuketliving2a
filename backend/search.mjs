export function matchesProperty(p, f = {}) {
  if (f.offer && p.offer !== f.offer) return false;
  if (f.location && p.location?.toLowerCase() !== f.location.toLowerCase()) return false;
  if (f.type && p.property_type !== f.type) return false;
  if (f.beds !== '' && f.beds != null) {
    const count=Number(f.beds);
    if (count === 0 ? Number(p.bedrooms) !== 0 : Number(p.bedrooms) < count) return false;
  }
  if (f.baths && Number(p.bathrooms)<Number(f.baths)) return false;
  if (f.min && Number(p.price)<Number(f.min)) return false;
  if (f.max && Number(p.price)>Number(f.max)) return false;
  if (f.size && (p.size_sqm == null || Number(p.size_sqm)<Number(f.size))) return false;
  if (f.feature && !(p.features || []).includes(f.feature)) return false;
  return true;
}
