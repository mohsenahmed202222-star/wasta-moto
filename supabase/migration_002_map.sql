-- =====================================================================
-- تحديث 2: الخريطة والتسعير التلقائي. شغّله مرة واحدة لو عندك قاعدة بيانات قديمة
-- (Supabase > SQL Editor > New query > Run). الداتا القديمة مش هتتمسح.
-- =====================================================================
alter table public.orders
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists drop_lat double precision,
  add column if not exists drop_lng double precision,
  add column if not exists distance_km numeric(7,2),
  add column if not exists suggested_price numeric(8,2);

-- المناطق بقت اختيارية (الموقع بيتحدد من الخريطة)
alter table public.orders alter column pickup_zone_id drop not null;
alter table public.orders alter column drop_zone_id drop not null;

-- المندوب الموثّق والمتاح يشوف كل طلبات بني سويف (من غير تحديد مناطق)
create or replace function public.driver_ok(p_zone int default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver' and p.is_verified and p.is_available);
$$;
