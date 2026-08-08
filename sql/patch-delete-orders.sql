-- صلاحية حذف الطلبات من لوحة الإدارة (تجربة / تنظيف)
-- نفّذ هذا مرة واحدة في Supabase → SQL Editor إن كان المشروع قائماً مسبقاً

drop policy if exists "orders_delete_anon" on public.orders;
create policy "orders_delete_anon" on public.orders
  for delete to anon using (true);
