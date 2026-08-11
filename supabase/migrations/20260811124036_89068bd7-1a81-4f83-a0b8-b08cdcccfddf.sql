CREATE POLICY "dept read member locations"
ON public.member_locations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'department'));

CREATE POLICY "dept read emergency sessions"
ON public.emergency_sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'department'));