-- =========================================================
-- شاي بكر — حماية بيانات العملاء
-- =========================================================
-- المشكلة قبل هذا الملف:
--   مفتاح الموقع العام يسمح لأي شخص بقراءة كل الطلبات
--   (أسماء وأرقام جوالات العملاء) وتعديلها.
--
-- بعد تنفيذه:
--   • الزائر يقدر يرسل طلباً ويشوف التواريخ المحجوزة فقط
--   • قراءة الطلبات وتعديلها وحذفها للمسجّلين دخول فقط
--
-- خطوات التنفيذ (مرة واحدة):
--   1) Supabase → Authentication → Users → Add user
--      أنشئ بريداً وكلمة مرور للإدارة، وفعّل Auto Confirm User
--   2) Supabase → SQL Editor → New query → الصق هذا الملف كامل → Run
--   3) في js/config.js اجعل: adminAuth: "supabase"
--   4) افتح لوحة الإدارة وسجّل الدخول بالبريد وكلمة المرور
-- =========================================================

-- ---------------------------------------------------------
-- 1) التواريخ المحجوزة للزوار — تواريخ فقط بلا أي بيانات شخصية
-- ---------------------------------------------------------
create or replace function public.booked_days()
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select distinct event_date
  from public.orders
  where status in ('pending', 'accepted')
    and left(coalesce(notes, ''), 11) <> '__deleted__';
$$;

revoke all on function public.booked_days() from public;
grant execute on function public.booked_days() to anon, authenticated;

-- ---------------------------------------------------------
-- 2) الطلبات: الزائر يضيف فقط، والإدارة المسجّلة لها كل شيء
-- ---------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_insert_anon" on public.orders;
drop policy if exists "orders_select_anon" on public.orders;
drop policy if exists "orders_update_anon" on public.orders;
drop policy if exists "orders_delete_anon" on public.orders;
drop policy if exists "orders_all_auth" on public.orders;

create policy "orders_insert_anon" on public.orders
  for insert to anon with check (true);

create policy "orders_all_auth" on public.orders
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------
-- 3) الزيارات: تُسجَّل من الموقع، وتُقرأ من الإدارة فقط
-- ---------------------------------------------------------
alter table public.visits enable row level security;

drop policy if exists "visits_insert_anon" on public.visits;
drop policy if exists "visits_select_anon" on public.visits;
drop policy if exists "visits_select_auth" on public.visits;

create policy "visits_insert_anon" on public.visits
  for insert to anon with check (true);

create policy "visits_select_auth" on public.visits
  for select to authenticated using (true);

-- ---------------------------------------------------------
-- 4) الحذف النهائي للطلب + السماح بحالة deleted
-- ---------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'accepted', 'rejected', 'deleted'));

-- تم. جرّب الموقع من جوالك: التواريخ المحجوزة تظهر، والطلب يُرسل،
-- ولوحة الإدارة تفتح بعد تسجيل الدخول فقط.
