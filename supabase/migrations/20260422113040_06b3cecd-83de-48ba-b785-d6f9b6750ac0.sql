-- Tour groups
CREATE TABLE public.tour_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE DEFAULT upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8)),
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tour_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.tour_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.member_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.tour_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.separation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.tour_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  distance_km DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function: is the current user in this group?
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

-- RLS
ALTER TABLE public.tour_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.separation_alerts ENABLE ROW LEVEL SECURITY;

-- tour_groups policies
CREATE POLICY "members read group" ON public.tour_groups FOR SELECT TO authenticated
  USING (auth.uid() = creator_id OR public.is_group_member(id, auth.uid()));
CREATE POLICY "auth read by invite" ON public.tour_groups FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "creator insert group" ON public.tour_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "creator update group" ON public.tour_groups FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id);
CREATE POLICY "creator delete group" ON public.tour_groups FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

-- tour_group_members policies
CREATE POLICY "members read membership" ON public.tour_group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "user join group" ON public.tour_group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user leave group" ON public.tour_group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- member_locations policies
CREATE POLICY "members read locations" ON public.member_locations FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "user upsert own location" ON public.member_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "user update own location" ON public.member_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "user delete own location" ON public.member_locations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- separation_alerts policies
CREATE POLICY "members read sep alerts" ON public.separation_alerts FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members insert sep alerts" ON public.separation_alerts FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id, auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tour_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tour_group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.separation_alerts;

ALTER TABLE public.member_locations REPLICA IDENTITY FULL;
ALTER TABLE public.separation_alerts REPLICA IDENTITY FULL;