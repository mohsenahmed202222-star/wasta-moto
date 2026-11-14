import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from './App.jsx'
import { createDb, createClient } from './mock.js'
import './styles.css'

const db = createDb()
const customer = createClient(db, 'customer@demo.com')
const driver = createClient(db, 'driver@demo.com')
const Pane = ({ title, sb }) => <section className="pv-col"><h3>{title}</h3><div className="pv-phone"><MemoryRouter><App sb={sb} /></MemoryRouter></div></section>

createRoot(document.getElementById('root')).render(
  <div className="pv">
    <header className="pv-h"><h1>🏍️ معاينة تطبيق موتو دليفري</h1>
      <p>بيانات تجريبية جوه المتصفح. اطلب من شاشة العميل وشوف الطلب يوصل للمندوب، وجرّب القبول واقتراح السعر.</p></header>
    <div className="pv-row"><Pane title="👤 شاشة العميل" sb={customer} /><Pane title="🏍️ شاشة المندوب" sb={driver} /></div>
  </div>
)
