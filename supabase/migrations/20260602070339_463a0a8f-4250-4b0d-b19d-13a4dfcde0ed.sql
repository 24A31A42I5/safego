ALTER TABLE public.tour_groups
  ALTER COLUMN group_code SET DEFAULT ('SG-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5)));
