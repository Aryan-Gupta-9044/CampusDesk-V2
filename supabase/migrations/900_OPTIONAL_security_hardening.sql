-- =====================================================================
-- 900_OPTIONAL_security_hardening.sql
--   >>> NOT part of the default V1 path. Read before running. <<<
--
-- Why optional: it CHANGES behaviour that V1 relies on.
--   1. New auth users always become 'student' (V1 trusted a role sent by the signup form,
--      which lets anyone self-register as admin). After this, V1's "register as parent" option
--      and V1's browser-side "create teacher/parent" flow stop assigning roles by themselves.
--      V2 handles this with the create-user Edge Function (supabase/functions/create-user).
--   2. Non-admins can no longer change their own role / status / id on profiles.
--
-- Run it only when: (a) V1 is retired, or (b) you accept the V1 behaviour change above.
-- Rollback: re-create V1's handle_new_user() from V1 supabase_schema.sql and
--           `drop trigger guard_profile_update on public.profiles;`
-- =====================================================================

-- @@FUNCTIONS
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (new.id, 'student', new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id then
      raise exception 'campusdesk:role_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- @@TRIGGERS
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles for each row execute procedure public.guard_profile_update();
