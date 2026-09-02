-- تقييمات الضيافة: الضيوف يرسلون، والإدارة توافق قبل الظهور على الموقع
-- Supabase → SQL Editor → Run

create table if not exists public.hospitality_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid,
  first_name text not null,
  last_name text not null,
  package_name text not null,
  rating int not null check (rating between 1 and 5),
  event_date date not null,
  comment text not null default '',
  city_label text not null default '',
  event_label text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists hospitality_reviews_status_idx
  on public.hospitality_reviews (status, created_at desc);
create index if not exists hospitality_reviews_order_idx
  on public.hospitality_reviews (order_id);

alter table public.hospitality_reviews enable row level security;

drop policy if exists "reviews_insert_anon" on public.hospitality_reviews;
create policy "reviews_insert_anon" on public.hospitality_reviews
  for insert to anon with check (status = 'pending');

drop policy if exists "reviews_select_approved_anon" on public.hospitality_reviews;
create policy "reviews_select_approved_anon" on public.hospitality_reviews
  for select to anon using (status = 'approved');

drop policy if exists "reviews_all_auth" on public.hospitality_reviews;
create policy "reviews_all_auth" on public.hospitality_reviews
  for all to authenticated using (true) with check (true);

-- بيانات المناسبة للباركود — بدون جوال العميل
create or replace function public.review_event_info(p_order_id uuid)
returns table (
  package_name text,
  event_date date,
  event_label text,
  city_label text,
  hall_name text,
  customer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.package_name, o.event_date, o.event_label, o.city_label, o.hall_name, o.customer_name
  from public.orders o
  where o.id = p_order_id
    and o.status = 'accepted'
    and left(coalesce(o.notes, ''), 11) <> '__deleted__';
$$;

revoke all on function public.review_event_info(uuid) from public;
grant execute on function public.review_event_info(uuid) to anon, authenticated;
