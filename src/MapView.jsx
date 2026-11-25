import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CITY } from './geo.js'

const pin = (cls, txt) => L.divIcon({ className: '', html: `<div class="mk ${cls}"><span>${txt}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 40] })

/**
 * خريطة OpenStreetMap
 * pick: وضع اختيار نقطة (الدبوس ثابت في النص، والمستخدم بيحرّك الخريطة)
 * marks: [{lat,lng,kind:'a'|'b'|'d'}]  line: مسار  fly: {lat,lng} للتحريك لنقطة
 */
export default function MapView({ pick, onPick, marks = [], line, fly, height = 320 }) {
  const el = useRef(), map = useRef(), layer = useRef(), cb = useRef(onPick)
  cb.current = onPick
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([CITY.lat, CITY.lng], CITY.zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    L.control.zoom({ position: 'bottomleft' }).addTo(m)
    layer.current = L.layerGroup().addTo(m); map.current = m
    if (pick) { const fire = () => { const c = m.getCenter(); cb.current?.({ lat: c.lat, lng: c.lng }) }; m.on('moveend', fire); fire() }
    setTimeout(() => m.invalidateSize(), 50)
    return () => m.remove()
  }, []) // eslint-disable-line
  useEffect(() => { if (fly) map.current.flyTo([fly.lat, fly.lng], 17, { duration: 0.8 }) }, [fly])
  useEffect(() => {
    const g = layer.current; g.clearLayers()
    if (line?.length > 1) L.polyline(line, { color: '#0f766e', weight: 5, opacity: 0.85 }).addTo(g)
    marks.forEach(p => L.marker([p.lat, p.lng], { icon: pin(p.kind, p.kind === 'a' ? 'أ' : p.kind === 'b' ? 'ب' : '🏍') }).addTo(g))
    const pts = [...marks.map(p => [p.lat, p.lng]), ...(line || [])]
    if (!pick && pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 })
  }, [JSON.stringify(marks), line?.length, pick]) // eslint-disable-line
  return (
    <div className="mapbox" style={{ height }}>
      <div ref={el} className="map" />
      {pick && <div className={'center-pin ' + pick}><span>{pick === 'a' ? 'أ' : 'ب'}</span></div>}
    </div>
  )
}
