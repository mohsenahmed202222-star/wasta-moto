import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from './App.jsx'
import { useSb, useToast, useLive, useZones, ZoneSelect, ORDER_SEL, STATUS, STEPS, zl, errMsg } from './ui.jsx'

export function CustomerHome() {
  const sb = useSb()
  const { session } = useAuth(); const nav = useNavigate(); const zones = useZones()
  const [orders, setOrders] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ pz: '', pa: '', dz: '', da: '', note: '', price: 30 })
  const load = useCallback(async () => {
    const { data } = await sb.from('orders').select(ORDER_SEL).eq('customer_id', session.user.id).order('created_at', { ascending: false }).limit(20)
    setOrders(data || [])
  }, [session])
  useLive('orders', load)
  const submit = async e => {
    e.preventDefault(); setErr('')
    if (!f.pz || !f.dz || !f.pa.trim() || !f.da.trim()) return setErr('اختار المنطقتين واكتب العنوانين')
    if (+f.price < 5) return setErr('السعر لازم يكون 5 جنيه على الأقل')
    setBusy(true)
    const { data, error } = await sb.from('orders').insert({
      customer_id: session.user.id, pickup_zone_id: +f.pz, pickup_address: f.pa.trim(),
      drop_zone_id: +f.dz, drop_address: f.da.trim(), note: f.note.trim() || null, offered_price: +f.price,
    }).select('id').single()
    setBusy(false)
    if (error) setErr(errMsg(error)); else nav('/c/order/' + data.id)
  }
  return (
    <>
      <form className="card" onSubmit={submit}>
        <h2>اطلب مندوب 🏍️</h2>
        <label>منطقة الاستلام<ZoneSelect zones={zones} value={f.pz} onChange={v => setF({ ...f, pz: v })} /></label>
        <input placeholder="عنوان الاستلام أو علامة مميزة" value={f.pa} onChange={e => setF({ ...f, pa: e.target.value })} />
        <label>منطقة التوصيل<ZoneSelect zones={zones} value={f.dz} onChange={v => setF({ ...f, dz: v })} /></label>
        <input placeholder="عنوان التوصيل أو علامة مميزة" value={f.da} onChange={e => setF({ ...f, da: e.target.value })} />
        <label>وصف الطلب (اختياري)<textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="مثال: كيس أكل، خليه سخن" /></label>
        <label>السعر اللي عايز تدفعه (جنيه)<input type="number" min="5" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
        <p className="mut sm">المناديب ممكن يقبلوا سعرك أو يقترحوا سعر تاني، وإنت اللي تقرر.</p>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? '...' : 'اطلب دلوقتي'}</button>
      </form>
      <h3 className="sec">طلباتي</h3>
      {!orders.length && <p className="mut center">مفيش طلبات لسه</p>}
      {orders.map(o => (
        <Link key={o.id} to={'/c/order/' + o.id} className="card row">
          <div><b>{zl(o.pickup)} ← {zl(o.drop)}</b><div className="mut sm">{new Date(o.created_at).toLocaleString('ar-EG')}</div></div>
          <div className="end"><span className={'pill ' + o.status}>{STATUS[o.status]}</span><b>{o.final_price || o.offered_price} ج</b></div>
        </Link>
      ))}
    </>
  )
}

export function OrderPage() {
  const sb = useSb()
  const { id } = useParams(); const toast = useToast()
  const [o, setO] = useState(null); const [offers, setOffers] = useState([]); const [people, setPeople] = useState({}); const [loaded, setLoaded] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const prev = useRef({ status: null, offers: null })
  const load = useCallback(async () => {
    const { data: ord } = await sb.from('orders').select(ORDER_SEL).eq('id', id).maybeSingle()
    const { data: off } = await sb.from('offers').select('*').eq('order_id', id).order('created_at')
    const ids = [...new Set([...(off || []).map(x => x.driver_id), ord?.driver_id].filter(Boolean))]
    let map = {}
    if (ids.length) { const { data: ps } = await sb.from('profiles').select('*').in('id', ids); (ps || []).forEach(p => { map[p.id] = p }) }
    const pend = (off || []).filter(x => x.status === 'pending')
    const p = prev.current
    if (p.offers !== null && pend.length > p.offers) { const last = pend[pend.length - 1]; toast(`💬 ${map[last.driver_id]?.full_name || 'مندوب'} قدّم عرض ${last.price} جنيه`) }
    if (p.status && ord && ord.status !== p.status) {
      const n = map[ord.driver_id]?.full_name || 'المندوب'
      const m = { accepted: `✅ ${n} قبل طلبك وهو في الطريق إليك`, arrived: '📍 المندوب وصل لمكان الاستلام', delivering: '🏍️ طلبك في الطريق للتسليم', delivered: '🎉 تم تسليم الطلب بنجاح' }[ord.status]
      if (m) toast(m)
    }
    prev.current = { status: ord?.status || null, offers: pend.length }
    setPeople(map); setOffers(off || []); setO(ord); setLoaded(true)
  }, [id, toast])
  useLive(['orders', 'offers'], load)
  const call = async (fn, args) => { const { error } = await sb.rpc(fn, args); if (error) toast('⚠️ ' + errMsg(error)); load() }

  if (!loaded) return <p className="center mut">جاري التحميل...</p>
  if (!o) return <p className="center mut">الطلب غير موجود</p>
  const drv = people[o.driver_id]
  const idx = STEPS.map(s => s[0]).indexOf(o.status)
  return (
    <>
      <Link to="/c" className="link">← رجوع</Link>
      <div className="card"><h3>الطلب</h3>
        <p>📍 من: <b>{zl(o.pickup)}</b> — {o.pickup_address}</p>
        <p>🏁 إلى: <b>{zl(o.drop)}</b> — {o.drop_address}</p>
        {o.note && <p>📝 {o.note}</p>}
        <p>💰 {o.final_price ? 'السعر المتفق عليه' : 'السعر اللي عرضته'}: <span className="price">{o.final_price || o.offered_price} جنيه</span></p>
        <span className={'pill ' + o.status}>{STATUS[o.status]}</span>
      </div>

      {o.status === 'searching' && <>
        <div className="card center"><div className="radar">🏍️</div><b>جاري البحث عن مندوب...</b><p className="mut sm">هيوصلك إشعار أول ما مندوب يقبل أو يقترح سعر</p></div>
        {offers.filter(x => x.status === 'pending').map(x => {
          const d = people[x.driver_id]
          return (
            <div key={x.id} className="card new">
              <div className="driver"><div className="av">🧑‍🔧</div><div><b>{d?.full_name || 'مندوب'}</b><div className="mut sm">{d?.vehicle_model || 'موتوسيكل'} · {d?.vehicle_plate}</div></div><span className="price end">{x.price} ج</span></div>
              <div className="two"><button className="btn ok" onClick={() => call('accept_offer', { p_offer: x.id })}>قبول</button><button className="btn ghost" onClick={() => call('reject_offer', { p_offer: x.id })}>رفض</button></div>
            </div>
          )
        })}
      </>}

      {drv && o.status !== 'cancelled' && <div className="card driver new"><div className="av">🧑‍🔧</div>
        <div><b>{drv.full_name}</b><div className="mut sm">{drv.vehicle_model || 'موتوسيكل'} · {drv.vehicle_plate}</div>
          <a className="link" href={'tel:' + drv.phone}>📞 {drv.phone}</a></div></div>}

      {idx >= 0 && <div className="card steps">{STEPS.map((s, i) => <div key={s[0]} className={'st ' + (i <= idx ? 'done' : '')}><b>{i <= idx ? '✓' : ''}</b>{s[1]}</div>)}</div>}

      {['searching', 'accepted'].includes(o.status) && <button className={'btn ' + (askCancel ? '' : 'ghost')} onClick={() => (askCancel ? call('cancel_order', { p_order: o.id }) : setAskCancel(true))}>{askCancel ? 'اضغط تاني لتأكيد الإلغاء' : 'إلغاء الطلب'}</button>}
    </>
  )
}
