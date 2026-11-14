import { createContext, useContext, useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabase.js'
import { ToastProvider, SbCtx, useSb } from './ui.jsx'
import { Login, Signup } from './Auth.jsx'
import { CustomerHome, OrderPage } from './Customer.jsx'
import { DriverHome } from './Driver.jsx'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

function AuthProvider({ children }) {
  const sb = useSb()
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const load = async () => {
    if (!session) return setProfile(null)
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setProfile(data)
  }
  useEffect(() => { if (session !== undefined) { if (session) setProfile(undefined); load() } }, [session]) // eslint-disable-line
  const ready = session !== undefined && (!session || profile !== undefined)
  return <Ctx.Provider value={{ session, profile, reload: load, ready }}>{children}</Ctx.Provider>
}

function Shell({ children }) {
  const sb = useSb()
  const { profile, session } = useAuth(); const nav = useNavigate()
  return (
    <>
      <header className="top"><Link to="/" className="logo">🏍️ موتو دليفري</Link>
        {session && <div className="who"><span>{profile?.full_name}</span><button className="link" onClick={async () => { await sb.auth.signOut(); nav('/login') }}>خروج</button></div>}
      </header>
      <main className="app">{children}</main>
    </>
  )
}

function Guard({ role, children }) {
  const { ready, session, profile } = useAuth()
  if (!ready) return <p className="center mut">جاري التحميل...</p>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <p className="center mut">مفيش بيانات للحساب ده. اطلع واعمل حساب جديد.</p>
  if (role && profile.role !== role) return <Navigate to="/" replace />
  return children
}
function Home() {
  const { ready, session, profile } = useAuth()
  if (!ready) return <p className="center mut">جاري التحميل...</p>
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={profile?.role === 'driver' ? '/d' : '/c'} replace />
}

function Setup() {
  return (
    <div className="app"><div className="card"><h2>⚙️ لسه محتاج إعداد Supabase</h2>
      <p className="mut">ضيف المتغيرين دول في ملف <code>.env</code> (أو في Environment Variables على Vercel) وأعد التشغيل:</p>
      <pre>{'VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...'}</pre>
      <p className="mut">الخطوات الكاملة في ملف README.md</p></div></div>
  )
}

export default function App({ sb }) {
  const client = sb || supabase
  if (!client) return <Setup />
  return (
    <SbCtx.Provider value={client}><AuthProvider><ToastProvider><Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/c" element={<Guard role="customer"><CustomerHome /></Guard>} />
        <Route path="/c/order/:id" element={<Guard role="customer"><OrderPage /></Guard>} />
        <Route path="/d" element={<Guard role="driver"><DriverHome /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell></ToastProvider></AuthProvider></SbCtx.Provider>
  )
}
