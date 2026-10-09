-- Run once in the Supabase SQL editor. Only the server's service-role key has access.
create table if not exists public.neover_events (
  event_id text primary key check (length(event_id) = 64),
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  visitor_hash text not null check (length(visitor_hash) = 64),
  session_hash text not null check (length(session_hash) = 64),
  page text not null check (page in ('/', '/qui-sommes-nous.html', '/services.html', '/contact.html', '/mentions-legales.html'))
);
create index if not exists neover_events_day on public.neover_events(day);
alter table public.neover_events enable row level security;
revoke all on public.neover_events from public, anon, authenticated;
grant select, insert, delete on public.neover_events to service_role;
create table if not exists public.neover_audience_meta (id integer primary key, started_day text not null);
alter table public.neover_audience_meta enable row level security;
revoke all on public.neover_audience_meta from public, anon, authenticated;
grant select, insert on public.neover_audience_meta to service_role;

create or replace function public.neover_record(p_event_id text, p_day text, p_visitor_hash text, p_session_hash text, p_page text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.neover_audience_meta values (1, p_day) on conflict (id) do nothing;
  delete from public.neover_events where day < ((p_day::date - 89)::text);
  insert into public.neover_events(event_id, day, visitor_hash, session_hash, page)
  values (p_event_id, p_day, p_visitor_hash, p_session_hash, p_page)
  on conflict (event_id) do nothing;
end;
$$;
revoke all on function public.neover_record(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.neover_record(text,text,text,text,text) to service_role;

create or replace function public.neover_report(p_from text, p_to text)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'startedOn', (select started_day from public.neover_audience_meta where id=1),
    'daily', coalesce((select jsonb_agg(d order by day desc) from (
      select day, count(distinct visitor_hash) as visitors, count(distinct session_hash) as visits, count(*) as views
      from public.neover_events where day between p_from and p_to group by day
    ) d), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(p order by views desc, page) from (
      select page, count(*) as views from public.neover_events where day between p_from and p_to group by page
    ) p), '[]'::jsonb)
  );
$$;
revoke all on function public.neover_report(text,text) from public, anon, authenticated;
grant execute on function public.neover_report(text,text) to service_role;
