-- Phuket Living 2: additive, isolated tables. Never includes credentials or contact data in public listings.
create table public.pl2_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.pl2_properties (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  offer text not null check (offer in ('rent','sale')),
  property_type text not null check (property_type in ('Condo','Villa','House','Apartment','Land','Commercial')),
  location text not null check (char_length(location) between 1 and 100),
  price numeric not null check (price > 0 and price <= 1000000000000),
  price_period text not null check (price_period in ('month','day','total')),
  bedrooms integer not null default 0 check (bedrooms between 0 and 50),
  bathrooms integer not null default 0 check (bathrooms between 0 and 50),
  size_sqm numeric check (size_sqm > 0),
  features text[] not null default '{}',
  description text not null check (char_length(description) between 1 and 5000),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 10),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  created_at timestamptz not null default now()
);
create table public.pl2_property_contacts (
  property_id uuid primary key references public.pl2_properties(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 1 and 40)
);
create table public.pl2_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);
create index pl2_public_search_idx on public.pl2_properties (offer, location, property_type, price) where status='published';
create index pl2_properties_created_idx on public.pl2_properties (created_at desc);
alter table public.pl2_admins enable row level security;
alter table public.pl2_properties enable row level security;
alter table public.pl2_property_contacts enable row level security;
alter table public.pl2_messages enable row level security;
revoke all on public.pl2_admins, public.pl2_properties, public.pl2_property_contacts, public.pl2_messages from anon, authenticated;
grant select on public.pl2_properties to anon, authenticated;
grant select on public.pl2_admins to authenticated;
grant insert, update, delete on public.pl2_properties to authenticated;
grant select, update, delete on public.pl2_property_contacts, public.pl2_messages to authenticated;
create policy "pl2 own admin membership" on public.pl2_admins for select to authenticated using (user_id = (select auth.uid()));
create policy "pl2 published properties" on public.pl2_properties for select to anon, authenticated using (status='published');
create policy "pl2 admins select properties" on public.pl2_properties for select to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins insert properties" on public.pl2_properties for insert to authenticated with check (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins update properties" on public.pl2_properties for update to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))) with check (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins delete properties" on public.pl2_properties for delete to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins read contacts" on public.pl2_property_contacts for select to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins update contacts" on public.pl2_property_contacts for update to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))) with check (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins delete contacts" on public.pl2_property_contacts for delete to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins read messages" on public.pl2_messages for select to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins update messages" on public.pl2_messages for update to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))) with check (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
create policy "pl2 admins delete messages" on public.pl2_messages for delete to authenticated using (exists (select 1 from public.pl2_admins where user_id = (select auth.uid())));
-- A trusted server needs to add the specified verified administrator by email.
-- Anonymous submission inserts are intentionally not exposed directly to the Data API.

-- Global admission limit caps public submission load. Only the service role may call it.
create table public.pl2_rate_events (created_at timestamptz not null default now());
create index pl2_rate_events_time_idx on public.pl2_rate_events (created_at);
alter table public.pl2_rate_events enable row level security;
revoke all on public.pl2_rate_events from public, anon, authenticated;
create function public.pl2_reserve_submission() returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(89452037);
  delete from public.pl2_rate_events where created_at < now() - interval '2 hours';
  if (select count(*) from public.pl2_rate_events where created_at >= now() - interval '1 hour') >= 100 then
    return false;
  end if;
  insert into public.pl2_rate_events default values;
  return true;
end;
$$;
revoke all on function public.pl2_reserve_submission() from public, anon, authenticated;
grant execute on function public.pl2_reserve_submission() to service_role;
grant select, insert, update, delete on public.pl2_admins, public.pl2_properties, public.pl2_property_contacts, public.pl2_messages, public.pl2_rate_events to service_role;
