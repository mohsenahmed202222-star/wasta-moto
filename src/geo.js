// خدمات الخرائط المجانية (OpenStreetMap): البحث، تحديد العنوان، المسافة، والتسعير
export const CITY = { name: 'بني سويف', lat: 29.0661, lng: 31.0994, zoom: 14 }
// حدود البحث: محافظة بني سويف تقريبًا (غرب, شمال, شرق, جنوب)
const VIEWBOX = '30.60,29.45,31.45,28.55'

// ===== التسعير: عدّل الأرقام دي براحتك =====
export const PRICING = { base: 10, perKm: 3.5, min: 15, max: 1000 }
export function suggestPrice(km) {
  if (!km) return PRICING.min
  return Math.min(PRICING.max, Math.max(PRICING.min, Math.round(PRICING.base + km * PRICING.perKm)))
}

export function haversineKm(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** مسافة الطريق الفعلية من OSRM (مجاني). لو فشل بنستخدم المسافة المستقيمة × 1.3 */
export async function getRoute(a, b) {
  try {
    const u = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`
    const r = await fetch(u); const j = await r.json()
    const rt = j.routes?.[0]; if (!rt) throw new Error('no route')
    return { km: rt.distance / 1000, min: rt.duration / 60, line: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]), approx: false }
  } catch {
    const km = haversineKm(a, b) * 1.3
    return { km, min: (km / 25) * 60, line: [[a.lat, a.lng], [b.lat, b.lng]], approx: true }
  }
}

const short = a => {
  const parts = [a.road || a.pedestrian || a.neighbourhood, a.suburb || a.village || a.town || a.city_district || a.city].filter(Boolean)
  return parts.join('، ')
}
export async function reverse({ lat, lng }) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ar&zoom=18&lat=${lat}&lon=${lng}`)
    const j = await r.json()
    return short(j.address || {}) || j.display_name?.split(',').slice(0, 2).join('،') || ''
  } catch { return '' }
}
export async function search(q) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=ar&countrycodes=eg&limit=6&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`)
    const j = await r.json()
    return j.map(x => ({ lat: +x.lat, lng: +x.lon, label: x.display_name.split(',').slice(0, 3).join('،') }))
  } catch { return [] }
}
export const navLink = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`
export const fmtKm = k => (k < 1 ? Math.round(k * 1000) + ' متر' : k.toFixed(1) + ' كم')
