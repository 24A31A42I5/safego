-- shared_tours table
CREATE TABLE public.shared_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  creator_name text NOT NULL,
  title text NOT NULL,
  description text,
  start_label text NOT NULL,
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  dest_label text NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  route_polyline text,
  route_distance_m double precision NOT NULL DEFAULT 0,
  route_duration_s double precision NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  rating_sum integer NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_tours_start_coords ON public.shared_tours(start_lat, start_lng);
CREATE INDEX idx_shared_tours_dest_coords ON public.shared_tours(dest_lat, dest_lng);
CREATE INDEX idx_shared_tours_created_at ON public.shared_tours(created_at DESC);
CREATE INDEX idx_shared_tours_tags ON public.shared_tours USING GIN(tags);

ALTER TABLE public.shared_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read shared tours"
  ON public.shared_tours FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "creator insert shared tour"
  ON public.shared_tours FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "creator update shared tour"
  ON public.shared_tours FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "creator delete shared tour"
  ON public.shared_tours FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- ratings table
CREATE TABLE public.shared_tour_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.shared_tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, user_id)
);

CREATE INDEX idx_shared_tour_ratings_tour ON public.shared_tour_ratings(tour_id);

ALTER TABLE public.shared_tour_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read ratings"
  ON public.shared_tour_ratings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "user insert own rating"
  ON public.shared_tour_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user update own rating"
  ON public.shared_tour_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user delete own rating"
  ON public.shared_tour_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to maintain rating_sum / rating_count
CREATE OR REPLACE FUNCTION public.update_shared_tour_rating_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.shared_tours
       SET rating_sum = rating_sum + NEW.rating,
           rating_count = rating_count + 1
     WHERE id = NEW.tour_id;
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE public.shared_tours
       SET rating_sum = rating_sum - OLD.rating + NEW.rating
     WHERE id = NEW.tour_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.shared_tours
       SET rating_sum = GREATEST(0, rating_sum - OLD.rating),
           rating_count = GREATEST(0, rating_count - 1)
     WHERE id = OLD.tour_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_rating_totals_ins
  AFTER INSERT ON public.shared_tour_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_tour_rating_totals();

CREATE TRIGGER trg_rating_totals_upd
  AFTER UPDATE ON public.shared_tour_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_tour_rating_totals();

CREATE TRIGGER trg_rating_totals_del
  AFTER DELETE ON public.shared_tour_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_shared_tour_rating_totals();