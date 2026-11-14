import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSb } from "./ui.jsx";

const phoneOk = (p) => /^01[0125]\d{8}$/.test(p);

export function Login() {
  const sb = useSb();
  const nav = useNavigate();

  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");

    const { error } = await sb.auth.signInWithPassword(f);

    setBusy(false);

    if (error) {
      setErr(
        error.message.includes("Email not confirmed")
          ? "فعّل إيميلك الأول من الرسالة اللي وصلتلك"
          : "الإيميل أو كلمة السر غلط"
      );
    } else {
      nav("/");
    }
  };

  return (
    <form className="card" onSubmit={go}>
      <h2>تسجيل الدخول</h2>

      <label>
        الإيميل
        <input
          type="email"
          required
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
      </label>

      <label>
        كلمة السر
        <input
          type="password"
          required
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
      </label>

      {err && <p className="err">{err}</p>}

      <button className="btn" disabled={busy}>
        {busy ? "..." : "دخول"}
      </button>

      <p className="mut center">
        معندكش حساب؟ <Link to="/signup">سجّل دلوقتي</Link>
      </p>
    </form>
  );
}

export function Signup() {
  const sb = useSb();
  const nav = useNavigate();

  const [role, setRole] = useState("customer");

  const [f, setF] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    vehicle_plate: "",
    vehicle_model: "",
  });

  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const go = async (e) => {
    e.preventDefault();
    setErr("");

    if (f.full_name.trim().length < 3) return setErr("اكتب اسمك الكامل");

    if (!phoneOk(f.phone))
      return setErr("رقم الموبايل لازم يكون مصري صحيح (مثال: 01012345678)");

    if (f.password.length < 8)
      return setErr("كلمة السر لازم تكون 8 حروف على الأقل");

    if (role === "driver" && !f.vehicle_plate.trim())
      return setErr("اكتب رقم لوحة الموتوسيكل");

    setBusy(true);

    const { data, error } = await sb.auth.signUp({
      email: f.email.trim(),
      password: f.password,

      options: {
        emailRedirectTo: `${window.location.origin}/login`,

        data: {
          role,
          full_name: f.full_name.trim(),
          phone: f.phone,
          vehicle_plate: f.vehicle_plate.trim(),
          vehicle_model: f.vehicle_model.trim(),
        },
      },
    });

    setBusy(false);

    if (error) {
      return setErr(
        error.message.includes("registered")
          ? "الإيميل ده مسجل قبل كده"
          : error.message
      );
    }

    if (data.session) {
      nav("/");
    } else {
      setDone(true);
    }
  };

  if (done) {
    return (
      <div className="card center">
        <h2>✅ تم إنشاء الحساب</h2>

        <p>
          بعتنا لك رسالة على <b>{f.email}</b>. اضغط على رابط التفعيل اللي فيها
          وبعدين سجّل دخول.
        </p>

        {role === "driver" && (
          <p className="mut">
            حساب المندوب بيتراجع ويتوثّق قبل ما تبدأ تستقبل طلبات.
          </p>
        )}

        <Link className="btn" to="/login">
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={go}>
      <h2>حساب جديد</h2>

      <div className="seg">
        <button
          type="button"
          className={role === "customer" ? "on" : ""}
          onClick={() => setRole("customer")}
        >
          👤 عميل
        </button>

        <button
          type="button"
          className={role === "driver" ? "on" : ""}
          onClick={() => setRole("driver")}
        >
          🏍️ مندوب
        </button>
      </div>

      <label>
        الاسم الكامل
        <input required value={f.full_name} onChange={set("full_name")} />
      </label>

      <label>
        رقم الموبايل
        <input
          required
          inputMode="tel"
          placeholder="01012345678"
          value={f.phone}
          onChange={set("phone")}
        />
      </label>

      <label>
        الإيميل
        <input type="email" required value={f.email} onChange={set("email")} />
      </label>

      <label>
        كلمة السر
        <input
          type="password"
          required
          minLength={8}
          value={f.password}
          onChange={set("password")}
        />
      </label>

      {role === "driver" && (
        <>
          <label>
            رقم لوحة الموتوسيكل
            <input
              required
              value={f.vehicle_plate}
              onChange={set("vehicle_plate")}
            />
          </label>

          <label>
            نوع الموتوسيكل (اختياري)
            <input
              value={f.vehicle_model}
              onChange={set("vehicle_model")}
              placeholder="مثال: هوجن 150"
            />
          </label>
        </>
      )}

      {err && <p className="err">{err}</p>}

      <button className="btn" disabled={busy}>
        {busy ? "..." : "إنشاء الحساب"}
      </button>

      <p className="mut center">
        عندك حساب؟ <Link to="/login">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
