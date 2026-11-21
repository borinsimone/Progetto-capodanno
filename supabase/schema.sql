-- Run once in the SQL Editor of a new Supabase project.
-- Enable Authentication > Sign In / Providers > Anonymous Sign-ins.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  attendance text not null default 'maybe' check (attendance in ('yes','maybe','no')),
  guests integer not null default 0 check (guests between 0 and 10),
  note text not null default '' check (char_length(note) <= 500),
  avatar_path text default null,
  created_at timestamptz not null default now()
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('place','idea')),
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 1500),
  location text not null default '' check (char_length(location) <= 120),
  budget numeric(10,2) check (budget between 0 and 100000),
  link text not null default '' check (char_length(link) <= 2000 and (link = '' or link ~* '^https?://')),
  category text not null default 'Altro' check (category in ('Cibo & bevande','Musica','Attività','Tema della serata','Altro')),
  created_at timestamptz not null default now(),
  check (kind <> 'place' or char_length(trim(location)) > 0)
);
create table public.votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  primary key (user_id, proposal_id)
);
-- Prepared for the future album; there are deliberately no upload/write policies yet.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);
create index proposals_user_idx on public.proposals(user_id);
create index proposals_created_idx on public.proposals(created_at desc);
create index votes_proposal_idx on public.votes(proposal_id);
alter table public.profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.votes enable row level security;
alter table public.photos enable row level security;
revoke all on public.profiles, public.proposals, public.votes, public.photos from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.proposals, public.votes to authenticated;
grant select on public.photos to authenticated;
create policy "Participants see profiles" on public.profiles for select to authenticated using (true);
create policy "Create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Edit own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Participants see proposals" on public.proposals for select to authenticated using (true);
create policy "Create own proposal" on public.proposals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own proposal" on public.proposals for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Participants see votes" on public.votes for select to authenticated using (true);
create policy "Vote as yourself" on public.votes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Remove own vote" on public.votes for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Participants see photo metadata" on public.photos for select to authenticated using (true);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);
-- Private bucket reserved only. Add owner-folder upload and signed URL policies
-- when the photo feature is implemented; do not make the bucket public.
commit;
