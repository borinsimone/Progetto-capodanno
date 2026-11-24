-- Mezzanotte: execute in a NEW Supabase project. Internal tables/functions are not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.party_config (id boolean primary key default true check(id), invite_hash text not null);
-- Replace this code with a long random value before running. Share privately.
insert into private.party_config values (true, encode(sha256(convert_to('CAMBIA-QUESTO-CODICE-PRIVATO','UTF8')),'hex'));
create table private.party_members (user_id uuid primary key references auth.users on delete cascade, admin boolean not null default false);
alter table private.party_config enable row level security;
alter table private.party_members enable row level security;
revoke all on private.party_config,private.party_members from public,anon,authenticated;
create function private.is_party_member() returns boolean language sql stable security definer set search_path=private,public as $$ select auth.uid() is not null and exists(select 1 from party_members where user_id=auth.uid()) $$;
create function public.is_party_member() returns boolean language sql stable security invoker set search_path=public as $$ select private.is_party_member() $$;
create function private.is_party_admin() returns boolean language sql stable security definer set search_path=private,public as $$ select auth.uid() is not null and exists(select 1 from party_members where user_id=auth.uid() and admin) $$;
create function public.is_party_admin() returns boolean language sql stable security invoker set search_path=public as $$ select private.is_party_admin() $$;
create function public.party_membership() returns jsonb language sql stable security invoker set search_path=public as $$ select jsonb_build_object('joined',is_party_member(),'admin',is_party_admin()) $$;
create function private.join_party(invite text) returns void language plpgsql security definer set search_path=private,public as $$
begin
 if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
 if not exists(select 1 from party_config where invite_hash=encode(sha256(convert_to(invite,'UTF8')),'hex')) then raise exception 'Codice invito non valido'; end if;
 insert into party_members(user_id) values(auth.uid()) on conflict do nothing;
end $$;
create function public.join_party(invite text) returns void language sql security invoker set search_path=public as $$ select private.join_party(invite) $$;
revoke all on function private.join_party(text),private.is_party_member(),private.is_party_admin() from public,anon;
grant execute on function private.join_party(text),private.is_party_member(),private.is_party_admin() to authenticated;
revoke all on function public.join_party(text),public.party_membership(),public.is_party_member(),public.is_party_admin() from public,anon;
grant execute on function public.join_party(text),public.party_membership(),public.is_party_member(),public.is_party_admin() to authenticated;
create table public.party_records (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('profile','place','vote','decision','food','expense','transfer','media')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<16000),
 created_at timestamptz not null default now()
);
create unique index one_profile_per_person on public.party_records(owner) where kind='profile';
create unique index one_vote_per_place on public.party_records(owner,(payload->>'place')) where kind='vote';
create unique index one_decision on public.party_records(kind) where kind='decision';
create index records_kind on public.party_records(kind);
create index records_owner on public.party_records(owner);
alter table public.party_records enable row level security;
revoke all on public.party_records from public,anon;
grant select, insert, update, delete on public.party_records to authenticated;
create policy read_group on public.party_records for select to authenticated using(public.is_party_member());
create policy insert_own on public.party_records for insert to authenticated with check(public.is_party_member() and owner=auth.uid() and (kind<>'decision' or public.is_party_admin()));
create policy update_own on public.party_records for update to authenticated using(public.is_party_member() and (owner=auth.uid() or (kind='transfer' and (payload->>'to'=auth.uid()::text or public.is_party_admin())) or (kind='decision' and public.is_party_admin()))) with check(public.is_party_member());
create policy delete_own on public.party_records for delete to authenticated using(public.is_party_member() and owner=auth.uid() and (kind<>'transfer' or not coalesce((payload->>'confirmed')::boolean,false)));
create function private.validate_party_record() returns trigger language plpgsql set search_path=public as $$
declare member text; amount numeric;
begin
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.kind<>old.kind or new.created_at<>old.created_at then raise exception 'Identità record immutabile'; end if;
  if new.owner<>old.owner and not(new.kind='decision' and public.is_party_admin()) then raise exception 'Proprietario immutabile'; end if;
  if old.kind='transfer' then
   if old.payload->>'confirmed'='true' then raise exception 'Versamento già confermato'; end if;
   if (new.payload-'confirmed') is distinct from (old.payload-'confirmed') then raise exception 'Dettagli versamento immutabili'; end if;
   if new.payload->>'confirmed'='true' and not(old.payload->>'to'=auth.uid()::text or public.is_party_admin()) then raise exception 'Solo destinatario o organizzatore può confermare'; end if;
  end if;
 end if;
 if new.kind='profile' then
  if jsonb_typeof(new.payload->'name') is distinct from 'string' or jsonb_typeof(new.payload->'sleep') is distinct from 'boolean' or jsonb_typeof(new.payload->'guests') is distinct from 'number' or jsonb_typeof(new.payload->'allergies') is distinct from 'string' or jsonb_typeof(new.payload->'avoid') is distinct from 'string' then raise exception 'Tipi profilo non validi'; end if;
  if (new.payload->>'guests')::numeric<>trunc((new.payload->>'guests')::numeric) or length(new.payload->>'allergies')>500 or length(new.payload->>'avoid')>500 then raise exception 'Dettagli profilo non validi'; end if;
  if length(trim(new.payload->>'name')) not between 1 and 60 or new.payload->>'status' not in ('yes','maybe','no') or (new.payload->>'guests')::int not between 0 and 10 then raise exception 'Profilo non valido'; end if;
  if not(new.payload ?& array['name','status','guests','sleep','allergies','avoid']) then raise exception 'Profilo incompleto'; end if;
 end if;
 if new.kind in ('expense','transfer') then
  if jsonb_typeof(new.payload->'cents') is distinct from 'number' then raise exception 'Importo numerico richiesto'; end if;
  if not(new.payload ? 'cents') then raise exception 'Importo richiesto'; end if;
  amount=(new.payload->>'cents')::numeric;
  if amount<=0 or amount>10000000 or amount<>trunc(amount) then raise exception 'Importo non valido'; end if;
 end if;
 if new.kind='expense' then
  if jsonb_typeof(new.payload->'people') is distinct from 'array' then raise exception 'Quote richieste'; end if;
  if jsonb_array_length(new.payload->'people')=0 then raise exception 'Seleziona partecipanti'; end if;
  for member in select jsonb_array_elements_text(new.payload->'people') loop
   if not exists(select 1 from party_records where kind='profile' and owner::text=member) then raise exception 'Partecipante non valido'; end if;
  end loop;
 end if;
 if new.kind='transfer' then
  if new.payload->>'from' is distinct from new.owner::text or new.payload->>'to'=new.owner::text or not exists(select 1 from party_records where kind='profile' and owner::text=new.payload->>'to') then raise exception 'Versamento non valido'; end if;
  if TG_OP='INSERT' and new.payload->>'confirmed' is distinct from 'false' then raise exception 'Serve conferma separata'; end if;
 end if;
 if new.kind in ('place','food','expense') and coalesce(length(trim(new.payload->>'title')),0) not between 1 and 100 then raise exception 'Titolo richiesto'; end if;
 if new.kind in ('place','food','expense') and jsonb_typeof(new.payload->'title') is distinct from 'string' then raise exception 'Titolo non valido'; end if;
 if new.kind='place' then
  if jsonb_typeof(new.payload->'description') is distinct from 'string' or jsonb_typeof(new.payload->'link') is distinct from 'string' or jsonb_typeof(new.payload->'cost') is distinct from 'number' or jsonb_typeof(new.payload->'beds') is distinct from 'number' then raise exception 'Dettagli posto non validi'; end if;
  if (new.payload->>'cost')::numeric<0 or (new.payload->>'cost')::numeric>10000000 or (new.payload->>'beds')::numeric not between 0 and 1000 or (new.payload->>'beds')::numeric<>trunc((new.payload->>'beds')::numeric) then raise exception 'Costo o posti letto non validi'; end if;
 end if;
 if new.kind='food' and (jsonb_typeof(new.payload->'notes') is distinct from 'string' or new.payload->>'category' not in ('Cibo','Bevande','Dolci','Altro') or not(new.payload ? 'category')) then raise exception 'Dettagli cibo non validi'; end if;
 if new.kind='place' and coalesce(new.payload->>'link','')<>'' and new.payload->>'link' !~* '^https?://' then raise exception 'Link non valido'; end if;
 if new.kind in ('vote','decision') and not exists(select 1 from party_records where kind='place' and id::text=new.payload->>'place') then raise exception 'Proposta non valida'; end if;
 if new.kind='media' and (new.payload->>'path' not like new.owner::text||'/%' or not(new.payload ?& array['path','type'])) then raise exception 'Percorso non valido'; end if;
 if new.kind='media' and (jsonb_typeof(new.payload->'caption') is distinct from 'string' or new.payload->>'type' not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')) then raise exception 'Media non valido'; end if;
 return new;
end $$;
create trigger validate_record before insert or update on public.party_records for each row execute function private.validate_party_record();
create function private.cleanup_place() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if old.kind='place' then delete from party_records where kind in ('vote','decision') and payload->>'place'=old.id::text; end if; return old;
end $$;
create trigger cleanup_place after delete on public.party_records for each row execute function private.cleanup_place();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('party-media','party-media',false,20971520,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']);
create policy media_read on storage.objects for select to authenticated using(bucket_id='party-media' and public.is_party_member());
create policy media_upload on storage.objects for insert to authenticated with check(bucket_id='party-media' and public.is_party_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='party-media' and public.is_party_member() and (storage.foldername(name))[1]=auth.uid()::text);
revoke all on function private.validate_party_record(),private.cleanup_place() from public,anon,authenticated;
-- After the organizer joins, promote their UUID in SQL Editor:
-- update private.party_members set admin=true where user_id='UUID-ORGANIZZATORE';
