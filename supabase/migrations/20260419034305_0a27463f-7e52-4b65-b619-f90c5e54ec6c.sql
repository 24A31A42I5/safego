
-- Trigger function to create profile + role from auth.users metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  v_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'tourist');

  insert into public.profiles (id, full_name, email, phone, emergency_contact, department_type, digital_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'emergency_contact',
    new.raw_user_meta_data->>'department_type',
    coalesce(new.raw_user_meta_data->>'digital_id',
      'SG-' || upper(v_role::text) || '-' || floor(extract(epoch from now()) * 1000)::text)
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
