ALTER TABLE public.tour_groups
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS route_polyline text,
  ADD COLUMN IF NOT EXISTS route_distance_m double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS route_duration_s double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_shared_tour_id uuid;

CREATE INDEX IF NOT EXISTS idx_tour_groups_source_shared_tour_id
  ON public.tour_groups (source_shared_tour_id);