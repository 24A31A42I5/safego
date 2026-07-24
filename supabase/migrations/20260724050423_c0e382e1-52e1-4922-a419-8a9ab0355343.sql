
CREATE TABLE public.emergency_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery INTEGER,
  address TEXT,
  trip_snapshot JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_sessions TO authenticated;
GRANT ALL ON public.emergency_sessions TO service_role;

ALTER TABLE public.emergency_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own sessions"
  ON public.emergency_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can create sessions"
  ON public.emergency_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update own sessions"
  ON public.emergency_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete own sessions"
  ON public.emergency_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_emergency_sessions_user ON public.emergency_sessions(user_id, started_at DESC);
CREATE INDEX idx_emergency_sessions_token ON public.emergency_sessions(share_token);

-- Public read via share_token (bypasses RLS via SECURITY DEFINER, exposes only safe columns)
CREATE OR REPLACE FUNCTION public.get_emergency_session_by_token(_token TEXT)
RETURNS TABLE (
  id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery INTEGER,
  address TEXT,
  trip_snapshot JSONB,
  updated_at TIMESTAMPTZ,
  full_name TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.started_at, s.ended_at, s.last_lat, s.last_lng, s.accuracy,
         s.speed, s.heading, s.battery, s.address, s.trip_snapshot, s.updated_at,
         (SELECT p.full_name FROM public.profiles p WHERE p.id = s.user_id) AS full_name
  FROM public.emergency_sessions s
  WHERE s.share_token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_emergency_session_by_token(TEXT) TO anon, authenticated;
