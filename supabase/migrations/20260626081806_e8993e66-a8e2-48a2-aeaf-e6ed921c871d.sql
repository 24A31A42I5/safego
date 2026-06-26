CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.app_role := 'tourist';
begin
  insert into public.profiles (id, full_name, email, phone, emergency_contact, department_type, digital_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'emergency_contact',
    null,
    coalesce(new.raw_user_meta_data->>'digital_id',
      'SG-TOURIST-' || floor(extract(epoch from now()) * 1000)::text)
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict do nothing;

  return new;
end;
$function$;