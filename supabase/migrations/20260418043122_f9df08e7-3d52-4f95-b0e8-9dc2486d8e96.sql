drop policy if exists "public read lost photos" on storage.objects;

create policy "auth list lost photos" on storage.objects
  for select to authenticated using (bucket_id = 'lost-photos');

-- Public bucket already allows direct URL access via the public CDN endpoint
-- without needing a SELECT policy on storage.objects.