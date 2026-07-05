# Auto-email invoices from owner-specific senders

Send every generated invoice by email, using a "from" address that belongs to the invoice's property owner — either a verified business domain (e.g. `accounts@rambalbuilders.com`) or that owner's own Gmail account connected via Google OAuth.

## What the user will see

1. **Owner settings** (new fields on each property owner)
   - Sender name (e.g. "Rambal Builders")
   - Sender method: *Domain* or *Gmail*
   - If Domain: pick from verified domains configured for the workspace
   - If Gmail: a "Connect Gmail" button → Google consent → shows connected address, "Reconnect" / "Disconnect"
   - Optional CC / Reply-to
2. **Verified domains page** (workspace-level)
   - Add domain, view DNS records (SPF / DKIM), verification status
3. **Invoice behavior**
   - When an invoice is generated (1 day before due date, existing job), it is emailed automatically to the tenant's email
   - If tenant has no email → invoice still created, marked "email skipped (no address)"
   - If sender not configured for that property's owner → falls back to workspace default sender; if none, marked "email skipped (no sender)"
4. **Invoice row shows** an email status chip: Sent / Failed / Skipped, with timestamp and a **Resend** button
5. **PDF of the invoice is attached** to every email

## Sender resolution (default — adjustable later)

For each invoice: property → primary owner → owner's configured sender. Multi-owner properties use the owner with the highest share; ties fall back to workspace default. You can revisit this rule later without schema changes.

## Sending backends

- **Domain sending** uses Lovable's built-in email infrastructure. Each business domain is delegated to Lovable nameservers once; after that, any `anything@yourdomain.com` address on that domain can send.
- **Gmail sending** uses a per-owner Google OAuth connection. Each owner clicks "Connect Gmail" and grants `gmail.send` scope; we store their refresh token and send through the Gmail API as that user. Works for both `@gmail.com` and Google Workspace addresses. Personal `@gmail.com` cannot be sent through a domain provider — Google blocks it — so Gmail OAuth is the only correct path for those.

## Technical details

### New DB objects
- `workspace_email_domains` — verified sender domains per workspace (`domain`, `status`, `default_from_local_part`)
- `owner_email_senders` — one row per property owner: `owner_id`, `method` (`domain` | `gmail`), `from_name`, `from_email`, `domain_id?`, `gmail_refresh_token_encrypted?`, `gmail_email?`, `reply_to?`, `cc?`
- `invoice_email_log` — `invoice_id`, `to_email`, `from_email`, `method`, `status` (`sent`/`failed`/`skipped`), `error`, `provider_message_id`, `sent_at`
- Add `default_owner_id` to `workspaces` for fallback
- RLS + GRANTs per project rules; workspace-scoped

### New edge functions
- `send-invoice-email` — resolves sender, renders PDF (reuses existing `generate-invoice-pdf`), sends via Lovable Emails (domain) or Gmail API (Gmail OAuth), writes `invoice_email_log`
- `gmail-oauth-start` / `gmail-oauth-callback` — per-owner Google OAuth flow, stores encrypted refresh token
- Add invocation of `send-invoice-email` at the end of the existing invoice-generation flow (DB job → new trigger function → `pg_net` call, or move generation into an edge function that also sends)

### Email infrastructure setup
- Run Lovable email infrastructure setup (queues, cron, send log, suppression)
- User adds their business domain(s) via the email setup dialog and completes DNS

### Secrets required (requested only after you approve this plan)
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` — one Google Cloud OAuth app you create; used to let each owner connect their own Gmail (you'll get these from Google Cloud Console → Credentials, with `https://<project>/functions/v1/gmail-oauth-callback` as the redirect URI)
- Encryption key for Gmail refresh tokens (auto-generated)

### New UI
- Settings → **Sender domains** page (add/verify/remove)
- Property Owner detail: **Sender configuration** section (method, Gmail connect button, from name, reply-to)
- Invoice list: **Email status** column + **Resend** action

### Not in scope for this plan
- WhatsApp (deferred per your answer)
- Bulk marketing / newsletter sending
- Per-tenant custom senders (only per-owner)
- Inbound email / reply threading

## Rough build order
1. DB schema + RLS
2. Lovable email infrastructure + domain UI
3. Owner sender config UI (domain method only)
4. `send-invoice-email` function + auto-trigger on invoice generation + email log/resend UI
5. Google OAuth app + `gmail-oauth-*` functions + "Connect Gmail" flow
6. Gmail sending path in `send-invoice-email`
