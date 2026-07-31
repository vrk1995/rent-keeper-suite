-- Personal access tokens for the read-only MCP server (lets Claude query rent status,
-- overdue payments, etc. on a user's behalf). Only the hash is ever stored — the raw token
-- is shown once at creation time, same pattern as team_invites' token_hash.
CREATE TABLE public.mcp_api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Claude',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX mcp_api_tokens_user_id_idx ON public.mcp_api_tokens (user_id);
CREATE INDEX mcp_api_tokens_token_hash_idx ON public.mcp_api_tokens (token_hash) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_api_tokens TO authenticated;
GRANT ALL ON public.mcp_api_tokens TO service_role;

ALTER TABLE public.mcp_api_tokens ENABLE ROW LEVEL SECURITY;

-- Users manage only their own tokens. Creation goes through the create-mcp-token edge
-- function (so the raw token is hashed server-side before ever reaching the database), but
-- listing/revoking (updating revoked_at, or deleting) is safe to do directly from the client.
CREATE POLICY "Users can view their own mcp tokens" ON public.mcp_api_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can revoke their own mcp tokens" ON public.mcp_api_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mcp tokens" ON public.mcp_api_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
