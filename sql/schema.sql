-- شاي بكر — قاعدة البيانات
-- التنفيذ: Supabase → SQL Editor → New query → الصق الكل → Run

-- امتدادات مفيدة
create extension if not exists "pgcrypto";

-- --------------------
-- جدول الطلبات
-- --------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'deleted')),

  city_id text not null,
  city_label text not null,
  event_label text not null,

  package_id text not null,
  package_name text not null,
  package_price numeric not null default 0,

  addons jsonb not null default '[]'::jsonb,
  addons_total numeric not null default 0,
  grand_total numeric not null default 0,

  event_date date not null,
  customer_name text not null,
  customer_phone text not null,
  hall_name text not null,
  location_link text not null,
  notes text not null default '',

  -- لساعات الذروة في الإحصائيات
  hour_of_day int not null default 0
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_city_idx on public.orders (city_id);
create index if not exists orders_package_idx on public.orders (package_id);
create index if not exists orders_event_date_idx on public.orders (event_date);

-- --------------------
-- جدول زيارات الموقع
-- --------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text not null default '/',
  session_id text not null
);

create index if not exists visits_created_at_idx on public.visits (created_at desc);

-- --------------------
-- جدول إعدادات للمستقبل (قابل للتوسعة)
-- مثال: مفتاح/قيمة لأي إعداد لاحقاً بدون تعديل الجداول
-- --------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- --------------------
-- أمان الصفوف (RLS) — مناسب لـ MVP بدون سيرفر خاص
-- لاحقاً: استبدله بـ Auth للمستخدمين الإداريين
-- --------------------
alter table public.orders enable row level security;
alter table public.visits enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "orders_insert_anon" on public.orders;
create policy "orders_insert_anon" on public.orders
  for insert to anon with check (true);

drop policy if exists "orders_select_anon" on public.orders;
create policy "orders_select_anon" on public.orders
  for select to anon using (true);

drop policy if exists "orders_update_anon" on public.orders;
create policy "orders_update_anon" on public.orders
  for update to anon using (true) with check (true);

drop policy if exists "orders_delete_anon" on public.orders;
create policy "orders_delete_anon" on public.orders
  for delete to anon using (true);

drop policy if exists "visits_insert_anon" on public.visits;
create policy "visits_insert_anon" on public.visits
  for insert to anon with check (true);

drop policy if exists "visits_select_anon" on public.visits;
create policy "visits_select_anon" on public.visits
  for select to anon using (true);

drop policy if exists "settings_select_anon" on public.app_settings;
create policy "settings_select_anon" on public.app_settings
  for select to anon using (true);
