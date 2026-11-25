import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from './App.jsx'
import { useSb, useToast, useLive, ORDER_SEL, STATUS, STEPS, errMsg } from './ui.jsx'
import MapView from './MapView.jsx'
import { Icon } from './icons.jsx'
import { getRoute, reverse, search, suggestPrice, fmtKm, PRICING } from './geo.js'

function AddressPicker({ kind, point, address, setAddress, onPoint, fly, setFly }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [locBusy, setLocBusy] = useState(false)
  const t = useRef()
  const onSearch = v => {
    setQ(v); clearTimeout(t.current)
    if (v.trim().length < 3) return setRes([])
    t.current = setTimeout(async () => setRes(await search(v.trim())), 500)
  }
  const choose = r => { setFly({ lat: r.lat, lng: r.lng, t: Date.now() }); setRes([]); setQ(''); setAddress(r.label) }
  const locate = () => {
    if (!navigator.geolocation) return
    setLocBusy(true)
    navigator.geolocation.getCurrentPosition(p => { setLocBusy(false); setFly({ lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() }) }, () => setLocBusy(false), { enableHighAccuracy: true, timeout: 8000 })
  }
  return (
    <div className="stack">
      <div className="searchbox">
        <Icon n="search" />
        <input placeholder={kind === 'a' ? 'دوّر على مكان الاستلام' : 'دوّر على مكان التسليم'} value={q} onChange={e => onSearch(e.target.value)} />
        <button type="button" className="icon-btn" onClick={locate} aria-label="موقعي" disabled={locBusy}><Icon n="locate" /></button>
        {!!res.length && <ul className="results">{res.map((r, i) => <li key={i}><button type="button" onClick={() => choose(r)}>{r.label}</button></li>)}</ul>}
      </div>
      <label>العنوان أو علامة مميزة<input value={address} onChange={e => setAddress(e.target.value)} placeholder="اتحرك بالخريطة أو اكتب العنوان" /></label>
    </div>
  )
}

function NewOrder() {
  const sb = useSb(); const { session } = useAuth(); const nav = useNavigate()
  const [step, setStep] = useState('a')
  const [a, setA] = useState(null), [b, setB] = useState(null)
  const [aAddr, setAAddr] = useState(''), [bAddr, setBAddr] = useState('')
  const [fly, setFly] = useState(null)
  const [route, setRoute] = useState(null); const [price, setPrice] = useState(0)
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const cur = step === 'a' ? a : b
  const rev = useRef()
  const onMove = useCallback(p => {
    step === 'a' ? setA(p) : setB(p)
    clearTimeout(rev.current)
    rev.current = setTimeout(async () => { const t = await reverse(p); if (t) (step === 'a' ? setAAddr : setBAddr)(t) }, 600)
  }, [step])
  const toConfirm = async () => {
    setStep('c'); setRoute(null)
    const r = await getRoute(a, b); setRoute(r); setPrice(suggestPrice(r.km))
  }
  const submit = async () => {
    setErr('')
    if (+price < 5) return setErr('السعر لازم يكون 5 جنيه على الأقل')
    setBusy(true)
    const { data, error } = await sb.from('orders').insert({
      customer_id: session.user.id,
      pickup_lat: a.lat, pickup_lng: a.lng, pickup_address: aAddr.trim() || 'نقطة على الخريطة',
      drop_lat: b.lat, drop_lng: b.lng, drop_address: bAddr.trim() || 'نقطة على الخريطة',
      distance_km: +route.km.toFixed(2), suggested_price: suggestPrice(route.km),
      note: note.trim() || null, offered_price: +price,
    }).select('id').single()
    setBusy(false)
    if (error) setErr(errMsg(error)); else nav('/c/order/' + data.id)
  }
  const marks = [...(step !== 'a' && a ? [{ ...a, kind: 'a' }] : []), ...(step === 'c' && b ? [{ ...b, kind: 'b' }] : [])]
  const dots = ['a', 'b', 'c']
  return (
    <section className="card flush">
      <div className="steps-dots">{dots.map((d, i) => <i key={d} className={dots.indexOf(step) >= i ? 'on' : ''} />)}</div>
      {step !== 'c'
        ? <MapView key={step} pick={step} onPick={onMove} marks={marks} fly={fly} height={300} />
        : <MapView key="c" marks={[{ ...a, kind: 'a' }, { ...b, kind: 'b' }]} line={route?.line} height={260} />}
      <div className="sheet">
        {step === 'a' && <>
          <h2>من فين هنستلم؟</h2>
          <AddressPicker kind="a" address={aAddr} setAddress={setAAddr} fly={fly} setFly={setFly} />
          <button className="btn" disabled={!a} onClick={() => { setFly(null); setStep('b') }}>تأكيد مكان الاستلام</button>
        </>}
        {step === 'b' && <>
          <h2>هنوصّل فين؟</h2>
          <AddressPicker kind="b" address={bAddr} setAddress={setBAddr} fly={fly} setFly={setFly} />
          <div className="two"><button className="btn ghost" onClick={() => { setFly(a); setStep('a') }}>رجوع</button>
            <button className="btn" disabled={!b} onClick={toConfirm}>تأكيد التسليم</button></div>
        </>}
        {step === 'c' && <>
          <div className="trip">
            <div><i className="dot a">أ</i><span>{aAddr || 'نقطة الاستلام'}</span></div>
            <div><i className="dot b">ب</i><span>{bAddr || 'نقطة التسليم'}</span></div>
          </div>
          {!route ? <p className="mut center">بنحسب المسافة...</p> : <>
            <div className="stats"><div><Icon n="route" /><b>{fmtKm(route.km)}</b><small>المسافة{route.approx ? ' (تقريبية)' : ''}</small></div>
              <div><Icon n="clock" /><b>{Math.max(1, Math.round(route.min))} د</b><small>الوقت المتوقع</small></div>
              <div><Icon n="tag" /><b>{suggestPrice(route.km)} ج</b><small>السعر المقترح</small></div></div>
            <label>السعر اللي عايز تدفعه (جنيه)
              <div className="stepper"><button type="button" onClick={() => setPrice(p => Math.max(5, +p - 5))}>−</button>
                <input type="number" min="5" value={price} onChange={e => setPrice(e.target.value)} />
                <button type="button" onClick={() => setPrice(p => +p + 5)}>+</button></div></label>
            <p className="mut sm">السعر المقترح محسوب على المسافة. تقدر تعدّله، والمناديب ممكن يقبلوه أو يقترحوا سعر تاني، وإنت اللي تقرر.</p>
            <label>وصف الطلب (اختياري)<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: كيس أكل، خليه سخن" /></label>
            {err && <p className="err">{err}</p>}
            <div className="two"><button className="btn ghost" onClick={() => setStep('b')}>رجوع</button>
              <button className="btn" disabled={busy} onClick={submit}>{busy ? '...' : 'اطلب دلوقتي'}</button></div>
          </>}
        </>}
      </div>
    </section>
  )
}

export function CustomerHome() {
  const sb = useSb(); const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const load = useCallback(async () => {
    const { data } = await sb.from('orders').select(ORDER_SEL).eq('customer_id', session.user.id).order('created_at', { ascending: false }).limit(20)
    setOrders(data || [])
  }, [session])
  useLive('orders', load)
  return (
    <>
      <NewOrder />
      <h3 className="sec">طلباتي</h3>
      {!orders.length && <p className="mut center">مفيش طلبات لسه</p>}
      {orders.map(o => (
        <Link key={o.id} to={'/c/order/' + o.id} className="card row">
          <div className="grow"><b className="clip">{o.pickup_address}</b><div className="mut sm clip">← {o.drop_address}</div><div className="mut sm">{new Date(o.created_at).toLocaleString('ar-EG')}</div></div>
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
  const [askCancel, setAskCancel] = useState(false); const [line, setLine] = useState(null)
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
  useEffect(() => {
    if (o?.pickup_lat && !line) getRoute({ lat: o.pickup_lat, lng: o.pickup_lng }, { lat: o.drop_lat, lng: o.drop_lng }).then(r => setLine(r.line))
  }, [o?.id]) // eslint-disable-line
  const call = async (fn, args) => { const { error } = await sb.rpc(fn, args); if (error) toast('⚠️ ' + errMsg(error)); load() }

  if (!loaded) return <p className="center mut">جاري التحميل...</p>
  if (!o) return <p className="center mut">الطلب غير موجود</p>
  const drv = people[o.driver_id]
  const idx = STEPS.map(s => s[0]).indexOf(o.status)
  return (
    <>
      <Link to="/c" className="back"><Icon n="back" /> رجوع</Link>
      {o.pickup_lat && <div className="card flush"><MapView height={220} marks={[{ lat: o.pickup_lat, lng: o.pickup_lng, kind: 'a' }, { lat: o.drop_lat, lng: o.drop_lng, kind: 'b' }]} line={line} /></div>}
      <div className="card">
        <div className="trip">
          <div><i className="dot a">أ</i><span>{o.pickup_address}</span></div>
          <div><i className="dot b">ب</i><span>{o.drop_address}</span></div>
        </div>
        {o.note && <p className="mut">📝 {o.note}</p>}
        <div className="between"><span className={'pill ' + o.status}>{STATUS[o.status]}</span>
          <div className="end"><small className="mut">{o.final_price ? 'السعر المتفق عليه' : 'السعر اللي عرضته'}{o.distance_km ? ` · ${fmtKm(+o.distance_km)}` : ''}</small><span className="price">{o.final_price || o.offered_price} جنيه</span></div></div>
      </div>

      {o.status === 'searching' && <>
        <div className="card center"><div className="radar"><Icon n="bike" /></div><b>جاري البحث عن مندوب...</b><p className="mut sm">هيوصلك إشعار أول ما مندوب يقبل أو يقترح سعر</p></div>
        {offers.filter(x => x.status === 'pending').map(x => {
          const d = people[x.driver_id]
          return (
            <div key={x.id} className="card new">
              <div className="driver"><div className="av"><Icon n="user" /></div><div><b>{d?.full_name || 'مندوب'}</b><div className="mut sm">{d?.vehicle_model || 'موتوسيكل'} · {d?.vehicle_plate}</div></div><span className="price end">{x.price} ج</span></div>
              <div className="two"><button className="btn ok" onClick={() => call('accept_offer', { p_offer: x.id })}>قبول</button><button className="btn ghost" onClick={() => call('reject_offer', { p_offer: x.id })}>رفض</button></div>
            </div>
          )
        })}
      </>}

      {drv && o.status !== 'cancelled' && <div className="card driver new"><div className="av"><Icon n="user" /></div>
        <div className="grow"><b>{drv.full_name}</b><div className="mut sm">{drv.vehicle_model || 'موتوسيكل'} · {drv.vehicle_plate}</div></div>
        <a className="call" href={'tel:' + drv.phone} aria-label="اتصل"><Icon n="phone" /></a></div>}

      {idx >= 0 && <div className="card steps">{STEPS.map((s, i) => <div key={s[0]} className={'st ' + (i <= idx ? 'done' : '')}><b>{i <= idx ? '✓' : ''}</b>{s[1]}</div>)}</div>}

      {['searching', 'accepted'].includes(o.status) && <button className={'btn ' + (askCancel ? 'danger' : 'ghost')} onClick={() => (askCancel ? call('cancel_order', { p_order: o.id }) : setAskCancel(true))}>{askCancel ? 'اضغط تاني لتأكيد الإلغاء' : 'إلغاء الطلب'}</button>}
    </>
  )
}
