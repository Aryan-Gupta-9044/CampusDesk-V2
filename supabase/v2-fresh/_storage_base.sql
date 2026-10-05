-- =====================================================================
-- CampusDesk V2 - 03_storage.sql
-- Storage buckets + storage RLS. Run AFTER 02_rls_policies.sql.
-- Files are stored as "<user-id>/<file>" so the first folder name is the
-- owning auth user id, which the policies below check.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',   'avatars',   true,  2097152,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('documents', 'documents', false, 10485760, null),
  ('receipts',  'receipts',  false, 5242880,  array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable: remove our policies first
drop policy if exists "cd avatars public read"        on storage.objects;
drop policy if exists "cd avatars owner insert"       on storage.objects;
drop policy if exists "cd avatars owner update"       on storage.objects;
drop policy if exists "cd avatars owner delete"       on storage.objects;
drop policy if exists "cd documents owner read"       on storage.objects;
drop policy if exists "cd documents owner insert"     on storage.objects;
drop policy if exists "cd documents owner delete"     on storage.objects;
drop policy if exists "cd documents admin all"        on storage.objects;
drop policy if exists "cd receipts owner read"        on storage.objects;
drop policy if exists "cd receipts owner insert"      on storage.objects;
drop policy if exists "cd receipts admin all"         on storage.objects;

-- avatars: public read, owner write
create policy "cd avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "cd avatars owner insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd avatars owner update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd avatars owner delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- documents: private, owner (read / upload / delete) + admin
create policy "cd documents owner read" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd documents owner insert" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd documents owner delete" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd documents admin all" on storage.objects for all
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

-- receipts: private, owner (read / upload) + admin
create policy "cd receipts owner read" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd receipts owner insert" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cd receipts admin all" on storage.objects for all
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());
