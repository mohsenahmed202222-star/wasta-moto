import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export const SbCtx = createContext(null)
export const useSb = () => useContext(SbCtx)
const T = createContext(() => {})
export const useToast = () => useContext(T)
let ac
export function beep() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)()
    const o = ac.createOscillator(), g = ac.createGain()
    o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.08
    o.start(); o.stop(ac.currentTime + 0.18)
  } catch { /* الصوت اختياري */ }
}
export function ToastProvider({ children }) {
  const [list, setList] = useState([]); const n = useRef(0)
  const push = useCallback(msg => {
    const k = ++n.current
    setList(l => [...l, { k, msg }]); beep()
    setTimeout(() => setList(l => l.filter(x => x.k !== k)), 6000)
  }, [])
  return <T.Provider value={push}><div className="toasts">{list.map(t => <div key={t.k} className="toast">{t.msg}</div>)}</div>{children}</T.Provider>
}

export const STATUS = { searching: 'بيدوّر على مندوب', accepted: 'تم القبول', arrived: 'المندوب وصل للاستلام', delivering: 'في الطريق للتسليم', delivered: 'تم التسليم', cancelled: 'ملغي' }
export const STEPS = [['accepted', 'تم قبول الطلب'], ['arrived', 'المندوب وصل للاستلام'], ['delivering', 'الطلب في الطريق إليك'], ['delivered', 'تم التسليم']]
export const ORDER_SEL = '*, pickup:zones!pickup_zone_id(name,center), drop:zones!drop_zone_id(name,center)'
export const zl = z => (z ? `${z.name} (${z.center})` : '')

/** تحديث لحظي: بينفّذ fn أول ما الصفحة تفتح وكل ما حاجة تتغير في الجداول دي */
export function useLive(tables, fn) {
  const supabase = useSb()
  const ref = useRef(fn); ref.current = fn
  useEffect(() => {
    ref.current()
    const ch = supabase.channel('live' + Math.random().toString(36).slice(2))
    ;[].concat(tables).forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, p => ref.current(p)))
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line
}

export function useZones() {
  const supabase = useSb()
  const [zones, setZones] = useState([])
  useEffect(() => { supabase.from('zones').select('*').order('center').order('name').then(({ data }) => setZones(data || [])) }, [])
  return zones
}
export function ZoneSelect({ zones, value, onChange }) {
  const centers = [...new Set(zones.map(z => z.center))]
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">اختار المنطقة</option>
      {centers.map(c => <optgroup key={c} label={'مركز ' + c}>{zones.filter(z => z.center === c).map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</optgroup>)}
    </select>
  )
}
export const errMsg = e => ({ order_unavailable: 'الطلب ده اتاخد أو اتلغى', not_allowed: 'مش مسموح لك بالعملية دي', bad_price: 'السعر لازم يكون بين 5 و 1000 جنيه', bad_transition: 'حالة غير صحيحة' }[e?.message] || e?.message || 'حصل خطأ')
