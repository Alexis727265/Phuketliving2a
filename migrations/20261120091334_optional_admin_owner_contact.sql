alter table public.pl2_property_contacts
  alter column name drop not null,
  alter column email drop not null,
  alter column phone drop not null;
