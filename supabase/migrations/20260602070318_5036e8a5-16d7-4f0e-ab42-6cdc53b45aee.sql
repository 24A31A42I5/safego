-- Add a human-readable group code to tour_groups
ALTER TABLE public.tour_groups
  ADD COLUMN IF NOT EXISTS group_code TEXT;

-- Backfill existing rows with SG-XXXXX code derived from invite_code
UPDATE public.tour_groups
   SET group_code = 'SG-' || upper(substring(md5(id::text || invite_code) from 1 for 5))
 WHERE group_code IS NULL;

-- Enforce uniqueness and not null going forward
ALTER TABLE public.tour_groups
  ALTER COLUMN group_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tour_groups_group_code_key
  ON public.tour_groups (group_code);

-- Trigger to auto-generate group_code on insert if not provided
CREATE OR REPLACE FUNCTION public.set_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  tries INT := 0;
BEGIN
  IF NEW.group_code IS NULL OR length(NEW.group_code) = 0 THEN
    LOOP
      candidate := 'SG-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 5));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tour_groups WHERE group_code = candidate);
      tries := tries + 1;
      IF tries > 10 THEN
        candidate := 'SG-' || upper(substring(md5(random()::text || NEW.id::text) from 1 for 5));
        EXIT;
      END IF;
    END LOOP;
    NEW.group_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_group_code ON public.tour_groups;
CREATE TRIGGER trg_set_group_code
BEFORE INSERT ON public.tour_groups
FOR EACH ROW EXECUTE FUNCTION public.set_group_code();

-- Join requests table
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  requester_id UUID NOT NULL,
  requester_name TEXT NOT NULL,
  requester_avatar TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  decided_at TIMESTAMP WITH TIME ZONE,
  decided_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS group_join_requests_unique_pending
  ON public.group_join_requests (group_id, requester_id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;
GRANT ALL ON public.group_join_requests TO service_role;

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- Requester can see their own requests
CREATE POLICY "requester read own requests"
  ON public.group_join_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

-- Group creator (admin) can see all requests for their groups
CREATE POLICY "admin read group requests"
  ON public.group_join_requests
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tour_groups g
    WHERE g.id = group_join_requests.group_id
      AND g.creator_id = auth.uid()
  ));

-- Requester inserts their own request
CREATE POLICY "requester insert own request"
  ON public.group_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

-- Requester can cancel (delete) their own pending request
CREATE POLICY "requester delete own request"
  ON public.group_join_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id AND status = 'pending');

-- Admin can update request status (approve/reject)
CREATE POLICY "admin update group requests"
  ON public.group_join_requests
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tour_groups g
    WHERE g.id = group_join_requests.group_id
      AND g.creator_id = auth.uid()
  ));

-- Allow anyone authenticated to read a minimal preview of a group when they have the link/code.
-- (The existing "auth read by invite" policy on tour_groups already permits SELECT for authenticated.)
