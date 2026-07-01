
ALTER TABLE public.tour_groups
  ADD COLUMN IF NOT EXISTS route_segments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.shared_tours
  ADD COLUMN IF NOT EXISTS route_segments jsonb NOT NULL DEFAULT '[]'::jsonb;
