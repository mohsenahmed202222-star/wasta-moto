-- =====================================================================
-- موتو دليفري: قاعدة البيانات الكاملة. الصقه كله في Supabase > SQL Editor > Run
-- =====================================================================

-- ---------- المناطق (قابلة للتوسع: محافظة > مركز > منطقة/قرية) ----------
create table public.zones (
  id serial primary key,
  governorate text not null,
  center text not null,
  name text not null,
  unique (governorate, center, name)
);

-- ---------- الحسابات (عميل أو مندوب) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer','driver')),
  full_name text not null,
  phone text not null,
  vehicle_plate text,
  vehicle_model text,
  is_verified boolean not null default false,   -- يوافق عليه الأدمن من لوحة Supabase
  is_available boolean not null default false,
  created_at timestamptz not null default now()
);

-- المناطق اللي المندوب بيشتغل فيها
create table public.driver_zones (
  driver_id uuid not null references public.profiles(id) on delete cascade,
  zone_id int not null references public.zones(id) on delete cascade,
  primary key (driver_id, zone_id)
);

-- ---------- الطلبات ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  pickup_zone_id int references public.zones(id),          -- اختياري (الموقع من الخريطة)
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  drop_zone_id int references public.zones(id),
  drop_address text not null,
  drop_lat double precision,
  drop_lng double precision,
  distance_km numeric(7,2),
  suggested_price numeric(8,2),
  note text,
  offered_price numeric(8,2) not null check (offered_price >= 5),
  final_price numeric(8,2),
  status text not null default 'searching'
    check (status in ('searching','accepted','arrived','delivering','delivered','cancelled')),
  driver_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_zone_idx on public.orders (status, pickup_zone_id);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_driver_idx on public.orders (driver_id);

-- ---------- عروض الأسعار من المناديب ----------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  price numeric(8,2) not null check (price >= 5),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (order_id, driver_id)
);

-- ---------- إنشاء الحساب تلقائيًا بعد التسجيل ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone, vehicle_plate, vehicle_model)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'driver' then 'driver' else 'customer' end,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'بدون اسم'),
    coalesce(nullif(new.raw_user_meta_data->>'phone',''), ''),
    nullif(new.raw_user_meta_data->>'vehicle_plate',''),
    nullif(new.raw_user_meta_data->>'vehicle_model','')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- المستخدم العادي مايقدرش يغيّر دوره أو يوثّق نفسه (الأدمن بس من لوحة Supabase)
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.id := old.id; new.role := old.role; new.is_verified := old.is_verified;
  end if;
  return new;
end $$;
create trigger protect_profile_trg before update on public.profiles
  for each row execute function public.protect_profile();

-- هل أنا مندوب موثّق ومتاح؟ (بيشوف كل طلبات بني سويف)
create or replace function public.driver_ok(p_zone int default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver' and p.is_verified and p.is_available);
$$;

-- ---------- الأمان (RLS) ----------
alter table public.zones enable row level security;
alter table public.profiles enable row level security;
alter table public.driver_zones enable row level security;
alter table public.orders enable row level security;
alter table public.offers enable row level security;

create policy zones_read on public.zones for select to authenticated using (true);

create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- العميل يشوف بيانات المناديب اللي قدّموا عروض أو قبلوا طلبه، والمندوب يشوف عميل طلبه
create policy profiles_related_read on public.profiles for select to authenticated using (
  exists (
    select 1 from public.orders o
    where (o.customer_id = auth.uid() and (o.driver_id = profiles.id
            or exists (select 1 from public.offers f where f.order_id = o.id and f.driver_id = profiles.id)))
       or (o.driver_id = auth.uid() and o.customer_id = profiles.id)));

create policy dz_own on public.driver_zones for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy orders_read on public.orders for select to authenticated using (
  customer_id = auth.uid() or driver_id = auth.uid()
  or (status = 'searching' and public.driver_ok(pickup_zone_id)));
create policy orders_insert on public.orders for insert to authenticated with check (
  customer_id = auth.uid() and status = 'searching' and driver_id is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer'));

create policy offers_read on public.offers for select to authenticated using (
  driver_id = auth.uid()
  or exists (select 1 from public.orders o where o.id = offers.order_id and o.customer_id = auth.uid()));

-- ---------- العمليات (كلها عن طريق دوال آمنة) ----------
-- المندوب يقبل الطلب بسعر العميل مباشرة
create or replace function public.take_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'searching' then raise exception 'order_unavailable'; end if;
  if not public.driver_ok(o.pickup_zone_id) then raise exception 'not_allowed'; end if;
  update public.orders set status = 'accepted', driver_id = auth.uid(),
    final_price = offered_price, updated_at = now() where id = p_order;
  update public.offers set status = 'rejected' where order_id = p_order and status = 'pending';
end $$;

-- المندوب يقترح سعر مختلف
create or replace function public.make_offer(p_order uuid, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.status <> 'searching' then raise exception 'order_unavailable'; end if;
  if not public.driver_ok(o.pickup_zone_id) then raise exception 'not_allowed'; end if;
  if p_price < 5 or p_price > 1000 then raise exception 'bad_price'; end if;
  insert into public.offers (order_id, driver_id, price) values (p_order, auth.uid(), p_price)
  on conflict (order_id, driver_id) do update set price = excluded.price, status = 'pending', created_at = now();
end $$;

-- العميل يقبل عرض
create or replace function public.accept_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.offers; o public.orders;
begin
  select * into f from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;
  select * into o from public.orders where id = f.order_id for update;
  if o.customer_id <> auth.uid() then raise exception 'not_allowed'; end if;
  if o.status <> 'searching' or f.status <> 'pending' then raise exception 'order_unavailable'; end if;
  update public.orders set status = 'accepted', driver_id = f.driver_id,
    final_price = f.price, updated_at = now() where id = o.id;
  update public.offers set status = case when id = f.id then 'accepted' else 'rejected' end
    where order_id = o.id;
end $$;

-- العميل يرفض عرض
create or replace function public.reject_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.offers f set status = 'rejected'
  where f.id = p_offer and f.status = 'pending'
    and exists (select 1 from public.orders o where o.id = f.order_id and o.customer_id = auth.uid());
end $$;

-- المندوب يحدّث حالة التوصيل
create or replace function public.set_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; ok boolean;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.driver_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  ok := (o.status = 'accepted' and p_status = 'arrived')
     or (o.status = 'arrived' and p_status = 'delivering')
     or (o.status = 'delivering' and p_status = 'delivered');
  if not ok then raise exception 'bad_transition'; end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order;
end $$;

-- العميل يلغي الطلب
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelled', updated_at = now()
  where id = p_order and customer_id = auth.uid() and status in ('searching','accepted');
  update public.offers set status = 'rejected' where order_id = p_order and status = 'pending';
end $$;

revoke all on function public.take_order(uuid), public.make_offer(uuid, numeric), public.accept_offer(uuid),
  public.reject_offer(uuid), public.set_status(uuid, text), public.cancel_order(uuid), public.driver_ok(int) from public, anon;
grant execute on function public.take_order(uuid), public.make_offer(uuid, numeric), public.accept_offer(uuid),
  public.reject_offer(uuid), public.set_status(uuid, text), public.cancel_order(uuid), public.driver_ok(int) to authenticated;

-- ---------- التحديث اللحظي ----------
alter publication supabase_realtime add table public.orders, public.offers;

-- ---------- بيانات المناطق الأولية: محافظة بني سويف (زوّد عليها براحتك) ----------
insert into public.zones (governorate, center, name) values
('بني سويف','الواسطى','مدينة الواسطى (وسط البلد)'),('بني سويف','الواسطى','الميمون'),('بني سويف','الواسطى','قمن العروس'),
('بني سويف','الواسطى','أطواب'),('بني سويف','الواسطى','أنفسط'),('بني سويف','الواسطى','كفر عتمان'),
('بني سويف','الواسطى','بني سليمان'),('بني سويف','الواسطى','بني نصير'),('بني سويف','الواسطى','بني جدير'),
('بني سويف','الواسطى','الرقة الغربية'),('بني سويف','الواسطى','عزبة الحكيم'),
('بني سويف','إهناسيا','مدينة إهناسيا'),('بني سويف','إهناسيا','العواونة'),('بني سويف','إهناسيا','قاي'),('بني سويف','إهناسيا','ننا'),
('بني سويف','ببا','مدينة ببا'),('بني سويف','ببا','جزيرة ببا'),('بني سويف','ببا','سدس'),('بني سويف','ببا','قمبش الحمراء'),
('بني سويف','الفشن','مدينة الفشن'),('بني سويف','الفشن','أبسوج'),('بني سويف','الفشن','شنرا'),('بني سويف','الفشن','اقفهص'),
('بني سويف','سمسطا','مدينة سمسطا'),('بني سويف','سمسطا','دشطوط'),('بني سويف','سمسطا','بدهل'),('بني سويف','سمسطا','الشنطور'),
('بني سويف','ناصر','مدينة ناصر'),('بني سويف','ناصر','إشمنت'),('بني سويف','ناصر','دنديل'),('بني سويف','ناصر','دلاص'),
('بني سويف','بني سويف','مدينة بني سويف'),('بني سويف','بني سويف','تزمنت الشرقية'),('بني سويف','بني سويف','إبشنا'),('بني سويف','بني سويف','بياض العرب');
