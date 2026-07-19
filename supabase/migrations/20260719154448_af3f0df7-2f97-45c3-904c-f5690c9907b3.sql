CREATE TABLE public.user_onboarding (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_completed BOOLEAN NOT NULL DEFAULT false,
  tour_skipped BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_onboarding TO authenticated;
GRANT ALL ON public.user_onboarding TO service_role;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own onboarding" ON public.user_onboarding
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);