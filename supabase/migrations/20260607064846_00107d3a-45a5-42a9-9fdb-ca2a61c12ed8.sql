ALTER TABLE public.tour_groups ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;
ALTER TABLE public.tour_groups ADD COLUMN IF NOT EXISTS live_started_at timestamptz;