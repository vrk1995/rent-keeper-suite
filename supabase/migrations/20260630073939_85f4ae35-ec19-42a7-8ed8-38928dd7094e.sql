ALTER TABLE public.profiles ALTER COLUMN is_approved SET DEFAULT true;

UPDATE public.profiles
SET is_approved = true
WHERE is_approved IS DISTINCT FROM true;

CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, is_approved)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'full_name', ''), true)
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    is_approved = true;
  RETURN NEW;
END;
$$;