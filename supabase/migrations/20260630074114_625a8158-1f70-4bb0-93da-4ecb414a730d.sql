CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by_user_id uuid NOT NULL,
  invited_by_name text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.team_invites TO service_role;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_team_invites_email_pending ON public.team_invites (lower(email), accepted_at);
CREATE INDEX idx_team_invites_expires_at ON public.team_invites (expires_at);

CREATE TRIGGER update_team_invites_updated_at
BEFORE UPDATE ON public.team_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();