# موتو دليفري (React + Supabase)

## 1) إعداد قاعدة البيانات (مرة واحدة)
1. افتح supabase.com واعمل مشروع جديد (Free).
2. من القايمة: **SQL Editor** > New query، الصق محتوى `supabase/schema.sql` كله واضغط **Run**.
3. من **Project Settings > API** خد: `Project URL` و `anon public key`.
4. من **Authentication > Providers > Email**: خلّي Confirm email شغّال (عشان الإيميل يتأكد).
5. من **Authentication > URL Configuration**: حط لينك موقعك على Vercel في Site URL.

## 2) التشغيل على جهازك
```
copy .env.example .env      (وعدّل القيم)
npm install
npm run dev
```

## 3) الرفع على Vercel
- ارفع المشروع على GitHub (من غير node_modules و .env).
- في Vercel: Import، وفي **Environment Variables** ضيف `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`، وDeploy.

## 4) توثيق المناديب (المصداقية)
أي مندوب بيسجّل حسابه بيبقى **غير موثّق**، وماينفعش يستقبل طلبات.
راجع بياناته (الاسم، الموبايل، لوحة الموتوسيكل)، وبعدين من Supabase:
**Table Editor > profiles** > فعّل `is_verified` للمندوب.

## 5) إضافة مناطق أو محافظات (التوسع)
من **Table Editor > zones** ضيف صف: `governorate` (المحافظة)، `center` (المركز)، `name` (المنطقة أو القرية).
أو استورد ملف CSV. المناطق بتظهر تلقائيًا في التطبيق من غير تعديل كود.

## الدورة
عميل يطلب (منطقتين + عنوانين + سعر) > المناديب الموثّقين المتاحين في منطقة الاستلام بس يشوفوا الطلب >
المندوب يقبل بسعر العميل أو يقترح سعر > العميل يقبل أو يرفض > إشعار فوري > تتبع الحالة لحد التسليم.
