export const priceOnRequest = p => Number(p.price)<100 && /price\s+on\s+request|DM\s+for\s+rental\s+rates/i.test(p.description||'');
export const displayPrice = p => priceOnRequest(p)?'Price on request':'฿'+Number(p.price).toLocaleString('en-US',{maximumFractionDigits:2});
export const displayPeriod = p => priceOnRequest(p)||p.offer==='sale'?'':p.price_period==='month'?'/ month':p.price_period==='day'?'/ night':'total';
