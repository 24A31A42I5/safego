
-- 1. Extend shared_tours
ALTER TABLE public.shared_tours
  ADD COLUMN IF NOT EXISTS creator_avatar text,
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS tips text,
  ADD COLUMN IF NOT EXISTS likes_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count int NOT NULL DEFAULT 0;

-- 2. Likes
CREATE TABLE IF NOT EXISTS public.shared_tour_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.shared_tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, user_id)
);
ALTER TABLE public.shared_tour_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read likes" ON public.shared_tour_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "user insert own like" ON public.shared_tour_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user delete own like" ON public.shared_tour_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tour_likes_tour ON public.shared_tour_likes(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_likes_user ON public.shared_tour_likes(user_id);

-- 3. Saves
CREATE TABLE IF NOT EXISTS public.shared_tour_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.shared_tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, user_id)
);
ALTER TABLE public.shared_tour_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read saves" ON public.shared_tour_saves FOR SELECT TO authenticated USING (true);
CREATE POLICY "user insert own save" ON public.shared_tour_saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user delete own save" ON public.shared_tour_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tour_saves_tour ON public.shared_tour_saves(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_saves_user ON public.shared_tour_saves(user_id);

-- 4. Comments
CREATE TABLE IF NOT EXISTS public.shared_tour_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.shared_tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_tour_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read comments" ON public.shared_tour_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "user insert own comment" ON public.shared_tour_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own comment" ON public.shared_tour_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user delete own comment" ON public.shared_tour_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tour_comments_tour ON public.shared_tour_comments(tour_id, created_at DESC);

-- 5. Counter triggers
CREATE OR REPLACE FUNCTION public.update_tour_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_tours SET likes_count = likes_count + 1 WHERE id = NEW.tour_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shared_tours SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.tour_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.update_tour_saves_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_tours SET saves_count = saves_count + 1 WHERE id = NEW.tour_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shared_tours SET saves_count = GREATEST(0, saves_count - 1) WHERE id = OLD.tour_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.update_tour_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_tours SET comments_count = comments_count + 1 WHERE id = NEW.tour_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shared_tours SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.tour_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_tour_likes_count ON public.shared_tour_likes;
CREATE TRIGGER trg_tour_likes_count
  AFTER INSERT OR DELETE ON public.shared_tour_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_tour_likes_count();

DROP TRIGGER IF EXISTS trg_tour_saves_count ON public.shared_tour_saves;
CREATE TRIGGER trg_tour_saves_count
  AFTER INSERT OR DELETE ON public.shared_tour_saves
  FOR EACH ROW EXECUTE FUNCTION public.update_tour_saves_count();

DROP TRIGGER IF EXISTS trg_tour_comments_count ON public.shared_tour_comments;
CREATE TRIGGER trg_tour_comments_count
  AFTER INSERT OR DELETE ON public.shared_tour_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_tour_comments_count();

-- 6. Storage bucket for tour photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tour-photos', 'tour-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tour photos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'tour-photos');

CREATE POLICY "tour photos auth upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tour-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "tour photos owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tour-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
