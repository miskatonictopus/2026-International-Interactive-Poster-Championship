-- Votos del 2026 International Interactive Poster Championship.
-- Un voto por póster y votante (cookie anónima); cambiar el voto lo sobrescribe.

create table if not exists public.votes (
  poster text not null,
  voter uuid not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poster, voter)
);

-- Solo el servidor (clave secreta / service_role) accede a la tabla.
alter table public.votes enable row level security;
revoke all on table public.votes from anon, authenticated;

-- Totales por póster en una sola consulta.
create or replace function public.vote_totals()
returns table (poster text, total bigint, points bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.poster, count(*), sum(v.rating)
  from public.votes v
  group by v.poster
$$;

revoke execute on function public.vote_totals() from public, anon, authenticated;
grant execute on function public.vote_totals() to service_role;
