// Same logic the client uses, mirrored on the server so we can verify
// pricing at checkout (don't trust the browser's claimed total).

export async function lookupPostcode(pc) {
  const clean = String(pc || '').toUpperCase().replace(/\s+/g, '');
  if (!clean) throw new Error('Postcode required');
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  const data = await r.json();
  if (!data || data.status !== 200) throw new Error('Postcode not found');
  return { lat: data.result.latitude, lng: data.result.longitude, formatted: data.result.postcode };
}

export function distanceMiles(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

export async function quoteForCustomer(customerPostcode, config, cartSubtotal = 0) {
  const dest = await lookupPostcode(customerPostcode);
  const origin = await lookupPostcode(config.basePostcode);
  const miles = distanceMiles(origin, dest);
  if (miles > (config.maxRadiusMiles || 5)) {
    return {
      ok: false,
      error: `Out of range: ${miles.toFixed(1)} mi from ${config.basePostcode} (max ${config.maxRadiusMiles} mi)`,
      miles,
      postcode: dest.formatted,
    };
  }
  const tier = Math.max(0, Math.ceil(miles));
  let fee = (config.baseDeliveryFee || 0) + tier * (config.perMileFee || 0);
  const time = (config.baseDeliveryMin || 0) + tier * (config.perMileDeliveryMin || 0);
  if ((config.freeDeliveryOver || 0) > 0 && cartSubtotal >= config.freeDeliveryOver) fee = 0;
  return { ok: true, miles, postcode: dest.formatted, fee, time, tier };
}
