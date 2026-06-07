
-- 1) tour_groups: remove world-readable policy; add safe preview + lookup RPCs
DROP POLICY IF EXISTS "auth read by invite" ON public.tour_groups;

CREATE OR REPLACE FUNCTION public.get_group_preview(_group_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  cover_image text,
  images text[],
  group_code text,
  creator_id uuid,
  tags text[],
  route_distance_m double precision,
  route_duration_s double precision,
  waypoints jsonb,
  member_count integer,
  creator_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.name, g.description, g.cover_image, g.images, g.group_code,
         g.creator_id, g.tags, g.route_distance_m, g.route_duration_s, g.waypoints,
         (SELECT count(*)::int FROM public.tour_group_members m WHERE m.group_id = g.id) AS member_count,
         (SELECT p.full_name FROM public.profiles p WHERE p.id = g.creator_id) AS creator_name
  FROM public.tour_groups g
  WHERE g.id = _group_id
$$;

CREATE OR REPLACE FUNCTION public.find_group_id_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tour_groups
  WHERE group_code = upper(_code) OR invite_code = upper(_code)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_group_preview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_group_id_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_group_id_by_code(text) TO authenticated;

-- 2) user_roles: prevent privilege escalation
DROP POLICY IF EXISTS "users insert own role" ON public.user_roles;
-- (Roles are inserted by the SECURITY DEFINER handle_new_user trigger only.)

-- 3) Storage: lost-photos — owner-scoped
DROP POLICY IF EXISTS "auth list lost photos" ON storage.objects;
DROP POLICY IF EXISTS "auth upload lost photos" ON storage.objects;

CREATE POLICY "lost photos owner or dept read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lost-photos'
  AND (auth.uid() = owner OR public.has_role(auth.uid(), 'department'::public.app_role))
);

CREATE POLICY "lost photos owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lost-photos'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "lost photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'lost-photos'
  AND (auth.uid() = owner OR public.has_role(auth.uid(), 'department'::public.app_role))
);

-- 4) Storage: tour-photos — drop broad public listing policy
-- Direct object URLs continue to work because the bucket is public.
DROP POLICY IF EXISTS "tour photos public read" ON storage.objects;

-- 5) Realtime: restrict broadcast/presence channels.
-- Postgres-changes subscriptions still respect table RLS independently.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny realtime broadcast/presence" ON realtime.messages;
CREATE POLICY "deny realtime broadcast/presence"
ON realtime.messages FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- 6) Tighten SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_group_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tour_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tour_saves_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tour_comments_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_shared_tour_rating_totals() FROM PUBLIC, anon, authenticated;
