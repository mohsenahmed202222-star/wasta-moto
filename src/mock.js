// قاعدة بيانات وهمية داخل المتصفح لمعاينة التطبيق (بتحاكي Supabase). مش بتتستخدم في النسخة الحقيقية.
const rid = () => 'id' + Math.random().toString(36).slice(2, 10)
const ZONES = { 'الواسطى': ['مدينة الواسطى (وسط البلد)', 'الميمون', 'قمن العروس', 'أطواب', 'أنفسط', 'كفر عتمان', 'بني سليمان', 'بني نصير', 'بني جدير', 'الرقة الغربية', 'عزبة الحكيم'],
  'إهناسيا': ['مدينة إهناسيا', 'العواونة', 'قاي', 'ننا'], 'ببا': ['مدينة ببا', 'جزيرة ببا', 'سدس', 'قمبش الحمراء'], 'الفشن': ['مدينة الفشن', 'أبسوج', 'شنرا', 'اقفهص'],
  'سمسطا': ['مدينة سمسطا', 'دشطوط', 'بدهل', 'الشنطور'], 'ناصر': ['مدينة ناصر', 'إشمنت', 'دنديل', 'دلاص'], 'بني سويف': ['مدينة بني سويف', 'تزمنت الشرقية', 'إبشنا', 'بياض العرب'] }

export function createDb() {
  const zones = []; let n = 1
  Object.entries(ZONES).forEach(([c, names]) => names.forEach(name => zones.push({ id: n++, governorate: 'بني سويف', center: c, name })))
  const now = new Date().toISOString()
  return {
    chans: new Set(), zones,
    users: [{ id: 'u_c', email: 'customer@demo.com', password: '12345678' }, { id: 'u_d', email: 'driver@demo.com', password: '12345678' }],
    profiles: [
      { id: 'u_c', role: 'customer', full_name: 'محمد أحمد', phone: '01012345678', is_verified: false, is_available: false, created_at: now },
      { id: 'u_d', role: 'driver', full_name: 'أحمد علي', phone: '01112345678', vehicle_plate: 'ب ن ج 1234', vehicle_model: 'هوجن 150', is_verified: true, is_available: true, created_at: now },
    ],
    driver_zones: [{ driver_id: 'u_d', zone_id: 1 }, { driver_id: 'u_d', zone_id: 2 }],
    orders: [], offers: [],
  }
}
const emit = (db, t) => db.chans.forEach(ch => ch.hs.forEach(h => { if (h.t === t) setTimeout(() => h.cb({ eventType: '*' }), 0) }))
const err = m => ({ data: null, error: { message: m } })

export function createClient(db, startEmail) {
  const first = db.users.find(u => u.email === startEmail)
  let session = first ? { user: { id: first.id, email: first.email } } : null
  const authCbs = new Set()
  const setSession = s => { session = s; authCbs.forEach(cb => cb(s ? 'SIGNED_IN' : 'SIGNED_OUT', s)) }
  const me = () => session?.user.id
  const prof = id => db.profiles.find(p => p.id === id)
  const driverOk = u => { const p = prof(u); return !!p && p.role === 'driver' && p.is_verified && p.is_available }
  const canSee = (t, r) => {
    const u = me(); if (!u) return false
    if (t === 'zones') return true
    if (t === 'driver_zones') return r.driver_id === u
    if (t === 'orders') return r.customer_id === u || r.driver_id === u || (r.status === 'searching' && driverOk(u))
    if (t === 'offers') { const o = db.orders.find(x => x.id === r.order_id); return r.driver_id === u || o?.customer_id === u }
    if (t === 'profiles') return r.id === u || db.orders.some(o => (o.customer_id === u && (o.driver_id === r.id || db.offers.some(f => f.order_id === o.id && f.driver_id === r.id))) || (o.driver_id === u && o.customer_id === r.id))
    return false
  }

  class QB {
    constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.ord = []; this.lim = null; this.mode = null; this.payload = null; this.sel = '*'; this.ret = false }
    select(s = '*') { this.sel = s; this.ret = true; return this }
    insert(p) { this.op = 'insert'; this.payload = p; return this }
    update(p) { this.op = 'update'; this.payload = p; return this }
    delete() { this.op = 'delete'; return this }
    eq(c, v) { this.f.push(r => r[c] === v); return this }
    in(c, a) { this.f.push(r => a.includes(r[c])); return this }
    order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this }
    limit(n) { this.lim = n; return this }
    maybeSingle() { this.mode = 'maybe'; return this }
    single() { this.mode = 'one'; return this }
    then(res, rej) { return Promise.resolve(this.exec()).then(res, rej) }
    out(rows) {
      if (this.mode === 'one') return rows[0] ? { data: rows[0], error: null } : err('not found')
      if (this.mode === 'maybe') return { data: rows[0] || null, error: null }
      return { data: rows, error: null }
    }
    exec() {
      const t = this.t, u = me(), tbl = db[t]
      if (!tbl) return err('no table')
      if (this.op === 'select') {
        let rows = tbl.filter(r => canSee(t, r)).filter(r => this.f.every(fn => fn(r)))
        this.ord.forEach(([c, asc]) => rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)))
        if (this.lim) rows = rows.slice(0, this.lim)
        rows = rows.map(r => {
          const c = { ...r }
          return c
        })
        return this.out(rows)
      }
      if (this.op === 'insert') {
        const arr = [].concat(this.payload); const made = []
        for (const p of arr) {
          if (t === 'orders') {
            if (p.customer_id !== u || prof(u)?.role !== 'customer') return err('RLS: not allowed')
            const row = { id: rid(), status: 'searching', driver_id: null, final_price: null, note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p }
            tbl.push(row); made.push(row)
          } else if (t === 'driver_zones') {
            if (p.driver_id !== u) return err('RLS: not allowed')
            if (!tbl.some(x => x.driver_id === p.driver_id && x.zone_id === p.zone_id)) tbl.push({ ...p })
            made.push(p)
          } else return err('RLS: not allowed')
        }
        emit(db, t); return this.ret ? this.out(made) : { data: null, error: null }
      }
      if (this.op === 'update') {
        const rows = tbl.filter(r => canSee(t, r) && this.f.every(fn => fn(r)))
        rows.forEach(r => { if (t === 'profiles' && r.id === u) { const { role, is_verified, id, ...ok } = this.payload; Object.assign(r, ok) } })
        emit(db, t); return { data: null, error: null }
      }
      if (this.op === 'delete') {
        if (t !== 'driver_zones') return err('RLS: not allowed')
        db[t] = db[t].filter(r => !(r.driver_id === u && this.f.every(fn => fn(r))))
        emit(db, t); return { data: null, error: null }
      }
    }
  }

  const rpcs = {
    take_order({ p_order }) {
      const o = db.orders.find(x => x.id === p_order), u = me()
      if (!o || o.status !== 'searching') return 'order_unavailable'
      if (!driverOk(u)) return 'not_allowed'
      Object.assign(o, { status: 'accepted', driver_id: u, final_price: o.offered_price, updated_at: new Date().toISOString() })
      db.offers.filter(f => f.order_id === o.id && f.status === 'pending').forEach(f => { f.status = 'rejected' })
    },
    make_offer({ p_order, p_price }) {
      const o = db.orders.find(x => x.id === p_order), u = me()
      if (!o || o.status !== 'searching') return 'order_unavailable'
      if (!driverOk(u)) return 'not_allowed'
      if (p_price < 5 || p_price > 1000) return 'bad_price'
      const ex = db.offers.find(f => f.order_id === o.id && f.driver_id === u)
      if (ex) Object.assign(ex, { price: p_price, status: 'pending', created_at: new Date().toISOString() })
      else db.offers.push({ id: rid(), order_id: o.id, driver_id: u, price: p_price, status: 'pending', created_at: new Date().toISOString() })
    },
    accept_offer({ p_offer }) {
      const f = db.offers.find(x => x.id === p_offer); if (!f) return 'offer_not_found'
      const o = db.orders.find(x => x.id === f.order_id)
      if (o.customer_id !== me()) return 'not_allowed'
      if (o.status !== 'searching' || f.status !== 'pending') return 'order_unavailable'
      Object.assign(o, { status: 'accepted', driver_id: f.driver_id, final_price: f.price, updated_at: new Date().toISOString() })
      db.offers.filter(x => x.order_id === o.id).forEach(x => { x.status = x.id === f.id ? 'accepted' : 'rejected' })
    },
    reject_offer({ p_offer }) {
      const f = db.offers.find(x => x.id === p_offer), o = f && db.orders.find(x => x.id === f.order_id)
      if (f && f.status === 'pending' && o.customer_id === me()) f.status = 'rejected'
    },
    set_status({ p_order, p_status }) {
      const o = db.orders.find(x => x.id === p_order)
      if (!o || o.driver_id !== me()) return 'not_allowed'
      const ok = (o.status === 'accepted' && p_status === 'arrived') || (o.status === 'arrived' && p_status === 'delivering') || (o.status === 'delivering' && p_status === 'delivered')
      if (!ok) return 'bad_transition'
      Object.assign(o, { status: p_status, updated_at: new Date().toISOString() })
    },
    cancel_order({ p_order }) {
      const o = db.orders.find(x => x.id === p_order)
      if (o && o.customer_id === me() && ['searching', 'accepted'].includes(o.status)) {
        o.status = 'cancelled'; db.offers.filter(f => f.order_id === o.id && f.status === 'pending').forEach(f => { f.status = 'rejected' })
      }
    },
  }

  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: cb => { authCbs.add(cb); return { data: { subscription: { unsubscribe: () => authCbs.delete(cb) } } } },
      signInWithPassword: async ({ email, password }) => {
        const us = db.users.find(x => x.email === email && x.password === password)
        if (!us) return { data: null, error: { message: 'Invalid login credentials' } }
        setSession({ user: { id: us.id, email: us.email } }); return { data: { session }, error: null }
      },
      signUp: async ({ email, password, options }) => {
        if (db.users.some(x => x.email === email)) return { data: null, error: { message: 'User already registered' } }
        const id = rid(), m = options.data
        db.users.push({ id, email, password })
        db.profiles.push({ id, role: m.role === 'driver' ? 'driver' : 'customer', full_name: m.full_name, phone: m.phone, vehicle_plate: m.vehicle_plate || null, vehicle_model: m.vehicle_model || null, is_verified: false, is_available: false, created_at: new Date().toISOString() })
        return { data: { session: null }, error: null }
      },
      signOut: async () => { setSession(null); return { error: null } },
    },
    from: t => new QB(t),
    rpc: async (name, args) => { const e = rpcs[name](args); emit(db, 'orders'); emit(db, 'offers'); return e ? err(e) : { data: null, error: null } },
    channel: () => { const ch = { hs: [], on(_ty, o, cb) { ch.hs.push({ t: o.table, cb }); return ch }, subscribe() { db.chans.add(ch); return ch } }; return ch },
    removeChannel: ch => db.chans.delete(ch),
  }
}
