ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS edited_by_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_edited_at TIMESTAMPTZ;

ALTER TABLE public.tournament_predictions
  ADD COLUMN IF NOT EXISTS edited_by_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_edited_at TIMESTAMPTZ;

CREATE POLICY "open users delete" ON public.users FOR DELETE TO public USING (true);