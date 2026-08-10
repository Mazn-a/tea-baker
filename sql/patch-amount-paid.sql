-- إضافة عمود المبلغ المدفوع لتتبع المتبقي على الزواجات
-- Supabase → SQL Editor → Run

alter table public.orders
  add column if not exists amount_paid numeric not null default 0;

comment on column public.orders.amount_paid is 'المبلغ الذي دفعه العميل — المتبقي = (package_price + addons_total) - amount_paid';
