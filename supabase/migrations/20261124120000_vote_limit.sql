-- Votación con correo verificado: máximo 3 pósters por persona.
--
-- Antes cada voto iba ligado a una cookie anónima y se podía votar de nuevo
-- en modo incógnito. Ahora `voter` es el id del usuario de Supabase Auth que
-- ha verificado su correo, y un trigger impide puntuar más de 3 pósters.

-- 1. Copia de seguridad de los votos anónimos y empezar de cero.
create table if not exists public.votes_backup_20261124 as
  table public.votes;
alter table public.votes_backup_20261124 enable row level security;
revoke all on table public.votes_backup_20261124 from anon, authenticated;

truncate table public.votes;

-- 2. Cada votante es un usuario verificado de Supabase Auth.
alter table public.votes
  add constraint votes_voter_fkey
  foreign key (voter) references auth.users (id) on delete cascade;

-- 3. Máximo 3 pósters distintos por votante (cambiar una nota sí se permite).
create or replace function public.enforce_vote_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serializa los votos de una misma persona: dos peticiones simultáneas
  -- no pueden colarse a la vez por debajo del límite.
  perform pg_advisory_xact_lock(hashtextextended(new.voter::text, 0));

  if not exists (
    select 1 from public.votes v
    where v.voter = new.voter and v.poster = new.poster
  ) and (
    select count(*) from public.votes v where v.voter = new.voter
  ) >= 3 then
    raise exception 'vote_limit_reached'
      using errcode = 'P0001', hint = 'Solo se pueden votar 3 pósters';
  end if;

  return new;
end
$$;

revoke execute on function public.enforce_vote_limit() from public, anon, authenticated;

drop trigger if exists votes_limit on public.votes;
create trigger votes_limit
  before insert on public.votes
  for each row execute function public.enforce_vote_limit();

-- Cambiar el póster o el votante de un voto existente se saltaría el límite.
create or replace function public.forbid_vote_reassignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.voter is distinct from old.voter or new.poster is distinct from old.poster then
    raise exception 'vote_reassignment_forbidden' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function public.forbid_vote_reassignment() from public, anon, authenticated;

drop trigger if exists votes_no_reassignment on public.votes;
create trigger votes_no_reassignment
  before update on public.votes
  for each row execute function public.forbid_vote_reassignment();
