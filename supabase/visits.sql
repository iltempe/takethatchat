-- TakeThatChat — tracker visite (analytics privata, privacy-minimal)
-- Esegui questo script nel SQL Editor del tuo progetto Supabase.
-- I dati NON sono leggibili pubblicamente: gli utenti anonimi possono solo
-- inserire una riga per visita; la lettura è riservata a te (dashboard/service role).
-- Nessun dato identificante: solo pagina, dominio di provenienza, lingua e un
-- id di sessione effimero (niente user-agent, niente risoluzione, niente IP).

-- 1) Tabella delle visite
create table if not exists public.visits (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  path        text,       -- quale pagina
  referrer    text,       -- solo il DOMINIO di provenienza (non l'URL completo)
  lang        text,       -- lingua del browser (es. it-IT)
  session     text        -- id di sessione effimero (non persistente)
);

-- 2) Row Level Security: attiva e consenti SOLO l'inserimento agli anonimi
alter table public.visits enable row level security;

grant insert on public.visits to anon;
revoke select on public.visits from anon, authenticated;

drop policy if exists "anon can insert visits" on public.visits;
create policy "anon can insert visits"
  on public.visits
  for insert
  to anon
  with check (true);

-- (Nessuna policy di SELECT => nessuno può leggere i dati tramite l'API pubblica.)

-- 3) Vista di riepilogo (visite per giorno). Non esposta all'API pubblica.
create or replace view public.visits_daily as
  select
    date_trunc('day', created_at)::date as day,
    count(*)                            as visits,
    count(distinct session)            as unique_sessions
  from public.visits
  group by 1
  order by 1 desc;

revoke all on public.visits_daily from anon, authenticated;

-- ------------------------------------------------------------------
-- Query utili (da lanciare nel SQL Editor quando vuoi le statistiche):
--
--   -- totale visite e sessioni uniche
--   select count(*) as visite, count(distinct session) as sessioni from public.visits;
--
--   -- visite per giorno
--   select * from public.visits_daily;
--
--   -- provenienza (referrer)
--   select coalesce(nullif(referrer,''),'(diretto)') as referrer, count(*)
--   from public.visits group by 1 order by 2 desc;
--
--   -- lingue dei visitatori
--   select lang, count(*) from public.visits group by 1 order by 2 desc;
-- ------------------------------------------------------------------
