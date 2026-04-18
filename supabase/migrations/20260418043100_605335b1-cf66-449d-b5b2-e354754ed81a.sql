-- Roles enum
create type public.app_role as enum ('tourist', 'department');

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  emergency_contact text,
  department_type text,
  digital_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- User roles (separate, secure)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Zones (drawn by departments, viewable by all auth users)
create type public.zone_type as enum ('safe', 'caution', 'danger');

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_type public.zone_type not null,
  coordinates jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.zones enable row level security;

-- SOS / Zone-entry alerts
create type public.alert_type as enum ('sos', 'zone_entry');
create type public.alert_status as enum ('critical', 'warning', 'resolved');

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  tourist_id uuid not null references auth.users(id) on delete cascade,
  tourist_name text not null,
  tourist_phone text,
  alert_type public.alert_type not null default 'sos',
  status public.alert_status not null default 'critical',
  lat double precision not null,
  lng double precision not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.sos_alerts enable row level security;

-- Lost & Found reports
create type public.report_status as enum ('active', 'found');

create table public.lost_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null,
  reporter_phone text,
  missing_name text not null,
  description text,
  photo_url text,
  status public.report_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.lost_reports enable row level security;

-- ============== RLS POLICIES ==============

create policy "users read own profile" on public.profiles
  for select using (auth.uid() = id or public.has_role(auth.uid(), 'department'));

create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "users read own roles" on public.user_roles
  for select using (auth.uid() = user_id);

create policy "users insert own role" on public.user_roles
  for insert with check (auth.uid() = user_id);

create policy "all auth read zones" on public.zones
  for select to authenticated using (true);

create policy "dept insert zones" on public.zones
  for insert to authenticated with check (public.has_role(auth.uid(), 'department'));

create policy "dept update zones" on public.zones
  for update to authenticated using (public.has_role(auth.uid(), 'department'));

create policy "dept delete zones" on public.zones
  for delete to authenticated using (public.has_role(auth.uid(), 'department'));

create policy "tourist insert own alert" on public.sos_alerts
  for insert to authenticated with check (auth.uid() = tourist_id);

create policy "read own or dept alerts" on public.sos_alerts
  for select to authenticated using (auth.uid() = tourist_id or public.has_role(auth.uid(), 'department'));

create policy "dept update alerts" on public.sos_alerts
  for update to authenticated using (public.has_role(auth.uid(), 'department'));

create policy "tourist insert own report" on public.lost_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

create policy "read own or dept reports" on public.lost_reports
  for select to authenticated using (auth.uid() = reporter_id or public.has_role(auth.uid(), 'department'));

create policy "dept or owner update report" on public.lost_reports
  for update to authenticated using (public.has_role(auth.uid(), 'department') or auth.uid() = reporter_id);

-- Realtime
alter publication supabase_realtime add table public.sos_alerts;
alter publication supabase_realtime add table public.lost_reports;
alter publication supabase_realtime add table public.zones;

-- Storage bucket for lost report photos
insert into storage.buckets (id, name, public) values ('lost-photos', 'lost-photos', true)
on conflict (id) do nothing;

create policy "public read lost photos" on storage.objects
  for select using (bucket_id = 'lost-photos');

create policy "auth upload lost photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'lost-photos');