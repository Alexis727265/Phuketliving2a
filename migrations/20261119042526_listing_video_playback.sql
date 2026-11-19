-- The Storage gateway reads authenticated object metadata before serving byte ranges.
alter policy "pl2 public play published videos" on storage.objects
using (
  bucket_id = 'phuketliving2-videos'
  and (select storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info',
    'object.head_authenticated_info'
  ]))
  and exists (
    select 1 from public.pl2_properties
    where status = 'published' and video_path = storage.objects.name
  )
);
