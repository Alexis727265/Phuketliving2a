alter table public.pl2_properties
  add column video_path text
  check (video_path is null or video_path ~ ('^' || id::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.mp4$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('phuketliving2-videos', 'phuketliving2-videos', false, 50000000, array['video/mp4']);

create policy "pl2 admins upload videos" on storage.objects for insert to authenticated
with check (
  bucket_id = 'phuketliving2-videos'
  and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.mp4$'
  and exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))
);

create policy "pl2 admins read videos" on storage.objects for select to authenticated
using (
  bucket_id = 'phuketliving2-videos'
  and exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))
);

create policy "pl2 admins delete videos" on storage.objects for delete to authenticated
using (
  bucket_id = 'phuketliving2-videos'
  and exists (select 1 from public.pl2_admins where user_id = (select auth.uid()))
  and not exists (select 1 from public.pl2_properties where video_path = storage.objects.name)
);

create policy "pl2 public play published videos" on storage.objects for select to anon
using (
  bucket_id = 'phuketliving2-videos'
  and (select storage.allow_any_operation(array['object.get_authenticated', 'object.head_authenticated_info']))
  and exists (
    select 1 from public.pl2_properties
    where status = 'published' and video_path = storage.objects.name
  )
);
