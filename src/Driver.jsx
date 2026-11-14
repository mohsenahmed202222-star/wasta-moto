import { useCallback, useRef, useState } from 'react'
import { useAuth } from './App.jsx'
import { useSb, useToast, useLive, useZones, ORDER_SEL, STATUS, zl, errMsg } from './ui.jsx'

const NEXT = { accepted: ['وصلت لمكان الاستلام', 'arrived'], arrived: ['استلمت الطلب وفي الطريق', 'delivering'], delivering: ['تم تسليم الطلب', 'delivered'] }

export function DriverHome() {
  const sb = useSb()
  const { profile, session, reload } = useAuth(); const toast = useToast(); const zones = useZones()
  const me = session.user.id
  const [mine, setMine] = useState(new Set()); const [feed, setFeed] = useState([]); const [myOffers, setMyOffers] = useState({})
  const [active, setActive] = useState(null); const [cust, setCust] = useState(null); const [prices, setPrices] = useState({})
  const seen = useRef(null); const prevActive = useRef(undefined)

  const load = useCallback(async () => {
    const { data: dz } = await sb.from('driver_zones').select('zone_id').eq('driver_id', me)
    setMine(new Set((dz || []).map(x => x.zone_id)))
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
    if (seen.current && [...ids].some(i => !seen.current.has(i))) toast('🔔 طلب جديد في منطقتك')
    seen.current = ids; setFeed(fd || [])
  }, [me, profile.is_verified, profile.is_available, toast])
  useLive(['orders', 'offers'], load)

  const act = async (fn, args, okMsg) => { const { error } = await sb.rpc(fn, args); if (error) toast('⚠️ ' + errMsg(error)); else if (okMsg) toast(okMsg); load() }
  const toggleZone = async id => {
    if (mine.has(id)) await sb.from('driver_zones').delete().eq('driver_id', me).eq('zone_id', id)
    else await sb.from('driver_zones').insert({ driver_id: me, zone_id: id })
    load()
  }
  const setAvail = async v => { await sb.from('profiles').update({ is_available: v }).eq('id', me); await reload() }
  const centers = [...new Set(zones.map(z => z.center))]

  if (!profile.is_verified) return <div className="card center"><h2>⏳ حسابك قيد المراجعة</h2><p className="mut">بنراجع بياناتك (الاسم، الموبايل، لوحة الموتوسيكل). هتقدر تستقبل طلبات أول ما يتم توثيق حسابك.</p></div>

  return (
    <>
      <div className="card"><label className="sw big"><input type="checkbox" checked={profile.is_available} disabled={!mine.size} onChange={e => setAvail(e.target.checked)} /> {profile.is_available ? '🟢 متاح لاستقبال الطلبات' : '⚪ غير متاح'}</label>
        {!mine.size && <p className="err sm">اختار المناطق اللي بتشتغل فيها الأول عشان تقدر تبقى متاح</p>}
        <details open={!mine.size}><summary><b>مناطق شغلي ({mine.size})</b></summary>
          <p className="mut sm">هيجيلك طلبات اللي الاستلام فيها من المناطق دي بس.</p>
          {centers.map(c => <div key={c} className="zgrp"><b>{c}</b><div className="zl">{zones.filter(z => z.center === c).map(z => <label key={z.id} className={'chip ' + (mine.has(z.id) ? 'on' : '')}><input type="checkbox" checked={mine.has(z.id)} onChange={() => toggleZone(z.id)} />{z.name}</label>)}</div></div>)}
        </details></div>

      {active && <div className="card new"><h3>طلب شغال حاليًا</h3>
        <p>👤 {cust?.full_name} · <a className="link" href={'tel:' + cust?.phone}>📞 {cust?.phone}</a></p>
        <p>📍 من: <b>{zl(active.pickup)}</b> — {active.pickup_address}</p><p>🏁 إلى: <b>{zl(active.drop)}</b> — {active.drop_address}</p>
        {active.note && <p>📝 {active.note}</p>}<p>💰 <span className="price">{active.final_price} جنيه</span> · {STATUS[active.status]}</p>
        <button className="btn ok" onClick={() => act('set_status', { p_order: active.id, p_status: NEXT[active.status][1] })}>{NEXT[active.status][0]}</button></div>}

      {!active && profile.is_available && <>
        <h3 className="sec">طلبات في مناطقك ({feed.length})</h3>
        {!feed.length && <div className="card center"><div className="radar sm">📡</div><p className="mut">منتظر طلبات جديدة...</p></div>}
        {feed.map(o => {
          const mo = myOffers[o.id]
          return (
            <div key={o.id} className="card new">
              <p>📍 من: <b>{zl(o.pickup)}</b> — {o.pickup_address}</p><p>🏁 إلى: <b>{zl(o.drop)}</b> — {o.drop_address}</p>
              {o.note && <p>📝 {o.note}</p>}
              <p>💰 العميل عارض: <span className="price">{o.offered_price} جنيه</span></p>
              {mo?.status === 'pending' && <p className="ok-t">⏳ عرضك ({mo.price} ج) في انتظار رد العميل</p>}
              {mo?.status === 'rejected' && <p className="err sm">العميل رفض عرضك ({mo.price} ج)، تقدر تقترح سعر تاني</p>}
              <button className="btn ok" onClick={() => act('take_order', { p_order: o.id })}>قبول بسعر {o.offered_price} ج</button>
              <div className="two"><input type="number" min="5" placeholder="سعرك (جنيه)" value={prices[o.id] || ''} onChange={e => setPrices({ ...prices, [o.id]: e.target.value })} />
                <button className="btn ghost" disabled={!(+prices[o.id] >= 5)} onClick={() => act('make_offer', { p_order: o.id, p_price: +prices[o.id] }, '📨 اتبعت عرضك للعميل')}>اقترح سعر</button></div>
            </div>
          )
        })}
      </>}
    </>
  )
}
