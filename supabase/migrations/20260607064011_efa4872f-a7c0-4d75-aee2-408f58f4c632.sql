-- Allow group creator (admin) to add approved members
CREATE POLICY "creator add member"
ON public.tour_group_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.tour_groups g
    WHERE g.id = tour_group_members.group_id AND g.creator_id = auth.uid()
  )
);