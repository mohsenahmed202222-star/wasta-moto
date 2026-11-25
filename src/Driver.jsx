import { useCallback, useRef, useState } from 'react'
import { useAuth } from './App.jsx'
import { useSb, useToast, useLive, ORDER_SEL, STATUS, errMsg } from './ui.jsx'
import MapView from './MapView.jsx'
import { Icon } from './icons.jsx'
import { navLink, fmtKm } from './geo.js'

const NEXT = { accepted: ['وصلت لمكان الاستلام', 'arrived'], arrived: ['استلمت الطلب وفي الطريق', 'delivering'], delivering: ['تم تسليم الطلب', 'delivered'] }

const Trip = ({ o }) => (
  <div className="trip">
    <div><i className="dot a">أ</i><span>{o.pickup_address}</span></div>
    <div><i className="dot b">ب</i><span>{o.drop_address}</span></div>
  </div>
)

export function DriverHome() {
  const sb = useSb()
  const { profile, session, reload } = useAuth(); const toast = useToast()
  const me = session.user.id
  const [feed, setFeed] = useState([]); const [myOffers, setMyOffers] = useState({})
  const [active, setActive] = useState(null); const [cust, setCust] = useState(null); const [prices, setPrices] = useState({})
  const seen = useRef(null); const prevActive = useRef(undefined)

  const load = useCallback(async () => {
    const { data: act } = await sb.from('orders').select(ORDER_SEL).eq('driver_id', me).in('status', ['accepted', 'arrived', 'delivering']).maybeSingle()
    if (act?.customer_id) { const { data: c } = await sb.from('profiles').select('full_name,phone').eq('id', act.customer_id).maybeSingle(); setCust(c) } else setCust(null)
    if (prevActive.current !== undefined && act && act.id !== prevActive.current) toast('🎉 العميل قبل عرضك، ابدأ التوصيل')
    prevActive.current = act?.id || null
    setActive(act || null)
    if (!profile.is_verified || !profile.is_available) { setFeed([]); return }
    const { data: fd } = await sb.from('orders').select(ORDER_SEL).eq('status', 'searching').order('created_at', { ascending: false }).limit(30)
    const { data: of } = await sb.from('offers').select('order_id,price,status').eq('driver_id', me)
    const m = {}; (of || []).forEach(x => { m[x.order_id] = x }); setMyOffers(m)
    const ids = new Set((fd || []).map(x => x.id))
    if (seen.current && [...ids].some(i => !seen.current.has(i))) toast('🔔 طلب جديد في بني سويف')
    seen.current = ids; setFeed(fd || [])
  }, [me, profile.is_verified, profile.is_available, toast])
  useLive(['orders', 'offers'], load)

  const act = async (fn, args, okMsg) => { const { error } = await sb.rpc(fn, args); if (error) toast('⚠️ ' + errMsg(error)); else if (okMsg) toast(okMsg); load() }
  const setAvail = async v => { await sb.from('profiles').update({ is_available: v }).eq('id', me); await reload() }

  if (!profile.is_verified) return <div className="card center"><h2>⏳ حسابك قيد المراجعة</h2><p className="mut">بنراجع بياناتك (الاسم، الموبايل، لوحة الموتوسيكل). هتقدر تستقبل طلبات أول ما يتم توثيق حسابك.</p></div>

  const heading = active && ['accepted', 'arrived'].includes(active.status) ? { lat: active.pickup_lat, lng: active.pickup_lng } : active && { lat: active.drop_lat, lng: active.drop_lng }
  return (
    <>
      <div className={'card avail ' + (profile.is_available ? 'on' : '')}>
        <label className="sw big"><input type="checkbox" checked={!!profile.is_available} onChange={e => setAvail(e.target.checked)} />
          <span className="knob" /> <span>{profile.is_available ? 'متاح لاستقبال الطلبات' : 'غير متاح'}</span></label>
        <p className="mut sm">بتستقبل الطلبات من كل بني سويف.</p>
      </div>

      {active && <div className="card flush new">
        {active.pickup_lat && <MapView height={200} marks={[{ lat: active.pickup_lat, lng: active.pickup_lng, kind: 'a' }, { lat: active.drop_lat, lng: active.drop_lng, kind: 'b' }]} />}
        <div className="sheet">
          <div className="between"><h3>طلب شغال حاليًا</h3><span className={'pill ' + active.status}>{STATUS[active.status]}</span></div>
          <p><Icon n="user" size={16} /> {cust?.full_name} · <a className="link" href={'tel:' + cust?.phone}>{cust?.phone}</a></p>
          <Trip o={active} />
          {active.note && <p className="mut">📝 {active.note}</p>}
          <div className="between"><span className="price">{active.final_price} جنيه</span>
            {heading?.lat && <a className="btn ghost sm-btn" target="_blank" rel="noreferrer" href={navLink(heading)}><Icon n="nav" size={16} /> فتح الملاحة</a>}</div>
          <button className="btn ok" onClick={() => act('set_status', { p_order: active.id, p_status: NEXT[active.status][1] })}>{NEXT[active.status][0]}</button>
        </div></div>}

      {!active && profile.is_available && <>
        <h3 className="sec">طلبات جديدة ({feed.length})</h3>
        {!feed.length && <div className="card center"><div className="radar sm"><Icon n="bike" /></div><p className="mut">منتظر طلبات جديدة...</p></div>}
        {feed.map(o => {
          const mo = myOffers[o.id]
          return (
            <div key={o.id} className="card flush new">
              {o.pickup_lat && <MapView height={150} marks={[{ lat: o.pickup_lat, lng: o.pickup_lng, kind: 'a' }, { lat: o.drop_lat, lng: o.drop_lng, kind: 'b' }]} />}
              <div className="sheet">
                <Trip o={o} />
                {o.note && <p className="mut">📝 {o.note}</p>}
                <div className="between"><span className="mut sm">{o.distance_km ? 'المسافة ' + fmtKm(+o.distance_km) : ''}</span><span>العميل عارض <span className="price">{o.offered_price} جنيه</span></span></div>
                {mo?.status === 'pending' && <p className="ok-t">⏳ عرضك ({mo.price} ج) في انتظار رد العميل</p>}
                {mo?.status === 'rejected' && <p className="err sm">العميل رفض عرضك ({mo.price} ج)، تقدر تقترح سعر تاني</p>}
                <button className="btn ok" onClick={() => act('take_order', { p_order: o.id })}>قبول بسعر {o.offered_price} ج</button>
                <div className="two"><input type="number" min="5" placeholder="سعرك (جنيه)" value={prices[o.id] || ''} onChange={e => setPrices({ ...prices, [o.id]: e.target.value })} />
                  <button className="btn ghost" disabled={!(+prices[o.id] >= 5)} onClick={() => act('make_offer', { p_order: o.id, p_price: +prices[o.id] }, '📨 اتبعت عرضك للعميل')}>اقترح سعر</button></div>
              </div>
            </div>
          )
        })}
      </>}
    </>
  )
}
