alter table public.pl2_properties add column if not exists featured boolean not null default false;
alter table public.pl2_properties add column if not exists details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object');
alter table public.pl2_properties add column if not exists updated_at timestamptz not null default now();
create or replace function public.pl2_touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger pl2_touch_updated_at before update on public.pl2_properties for each row execute function public.pl2_touch_updated_at();
create policy "pl2 admins upload media" on storage.objects for insert to authenticated with check (bucket_id = 'phuketliving2-images' and exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins insert contacts" on public.pl2_property_contacts for insert to authenticated with check (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create index if not exists pl2_published_search on public.pl2_properties (status, created_at desc);

grant insert on public.pl2_property_contacts to authenticated;
