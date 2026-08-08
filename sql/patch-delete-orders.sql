-- شاي بكر — صلاحية حذف الطلبات
-- التنفيذ: Supabase → SQL Editor → New query → الصق الكل → Run

drop policy if exists "orders_delete_anon" on public.orders;
create policy "orders_delete_anon" on public.orders
  for delete to anon using (true);

-- السماح بالحالة 'deleted' في عمود status
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'accepted', 'rejected', 'deleted'));
