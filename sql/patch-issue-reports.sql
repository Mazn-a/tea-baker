-- شاي بكر — جدول بلاغات المشاكل
-- التنفيذ: Supabase → SQL Editor → New query → الصق الكل → Run

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  contact text not null default '',
  page text not null default '',
  step text not null default '',
  user_agent text not null default '',
  session_id text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved'))
);

create index if not exists issue_reports_created_at_idx on public.issue_reports (created_at desc);

alter table public.issue_reports enable row level security;

drop policy if exists "issue_reports_insert_anon" on public.issue_reports;
create policy "issue_reports_insert_anon" on public.issue_reports
  for insert to anon with check (true);

drop policy if exists "issue_reports_all_auth" on public.issue_reports;
create policy "issue_reports_all_auth" on public.issue_reports
  for all to authenticated using (true) with check (true);
