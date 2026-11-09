-- Esquema de Transportista (Supabase / Postgres)
-- Progreso por usuario (repetición espaciada), historial de respuestas,
-- simulacros, reportes de errores y estadísticas globales anónimas.

create table if not exists public.progress (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid          text not null,
  reps         int  not null default 0,
  lapses       int  not null default 0,
  ease         real not null default 2.5,
  ivl          real not null default 0,       -- intervalo en días
  due          timestamptz,
  seen         int  not null default 0,
  correct      int  not null default 0,
  last_correct boolean,
  last_at      timestamptz,
  flagged      boolean not null default false,
  primary key (user_id, qid)
);

create table if not exists public.answers (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid        text not null,
  chosen     smallint,
  correct    boolean not null,
  mode       text,
  created_at timestamptz not null default now()
);
create index if not exists answers_user_time on public.answers (user_id, created_at desc);
create index if not exists answers_qid on public.answers (qid);

create table if not exists public.exams (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'test',
  total       int  not null,
  correct     int  not null,
  wrong       int  not null,
  blank       int  not null,
  score       real not null,
  duration_s  int,
  per_materia jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists exams_user on public.exams (user_id, created_at desc);

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid        text not null,
  message    text not null check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.progress enable row level security;
alter table public.answers  enable row level security;
alter table public.exams    enable row level security;
alter table public.reports  enable row level security;

create policy progress_own on public.progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy answers_select_own on public.answers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy answers_insert_own on public.answers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy answers_delete_own on public.answers for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy exams_own on public.exams for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reports_insert_own on public.reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Estadísticas globales (anónimas, agregadas): tasa de fallo en el PRIMER intento de cada usuario.
create or replace function public.community_stats(min_attempts int default 3)
returns table (qid text, attempts bigint, fails bigint, fail_rate numeric, top_wrong smallint)
language sql stable security definer set search_path = ''
as $$
  with firsts as (
    select distinct on (a.user_id, a.qid) a.qid, a.correct, a.chosen
    from public.answers a
    order by a.user_id, a.qid, a.created_at
  )
  select f.qid,
         count(*)                                   as attempts,
         count(*) filter (where not f.correct)      as fails,
         round(avg((not f.correct)::int)::numeric, 3) as fail_rate,
         mode() within group (order by f.chosen) filter (where not f.correct) as top_wrong
  from firsts f
  group by f.qid
  having count(*) >= min_attempts
$$;

create or replace function public.community_summary()
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'users',      (select count(distinct user_id) from public.answers),
    'answers',    (select count(*) from public.answers),
    'answers_7d', (select count(*) from public.answers where created_at > now() - interval '7 days'),
    'exams',      (select count(*) from public.exams)
  )
$$;

revoke all on function public.community_stats(int) from public;
revoke all on function public.community_summary() from public;
grant execute on function public.community_stats(int) to anon, authenticated;
grant execute on function public.community_summary() to anon, authenticated;
