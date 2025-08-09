### Goals and Scope (recap)
- Add fee reminders (monthly), basic document storage/parsing, and Zapier MCP-backed email/calendar for confirmations and reminders.
- Keep changes minimal and localized: new `memories` tables + tool wrappers; light orchestrator wiring; preserve Telegram pipeline and RLS posture.

## Milestones and Deliverables
- Day 1–2: DB migrations (fees, fee_jobs, documents, notification_settings, fee_calendar_events) + scaffolding for new tools in `tools.ts`.
- Day 3–4: Orchestrator wiring in `natural-db/index.ts` (intent mapping, `system_routine_task` handler, cron callback flow).
- Day 5: Document parsing via OpenAI + `docs_email_summary`.
- Day 6: Zapier MCP integration (email/calendar) and QA.
- Buffer: Hardening and docs.

## Database: new tables in `memories` (migration)
Create a new migration file under `supabase/migrations/` (e.g., `20250808_add_realestate_mvp.sql`).

- memories.fees
  - id UUID PK; chat_id TEXT; fee_type TEXT CHECK IN ('electricity','management','water','other'); amount NUMERIC NULL; currency TEXT NULL; due_day SMALLINT CHECK 1–31; note TEXT NULL; is_active BOOLEAN DEFAULT true; created_at/updated_at.
  - Indexes: (chat_id), (is_active, chat_id).
- memories.fee_jobs
  - id UUID PK; fee_id UUID FK→memories.fees(id); cron_job_name TEXT UNIQUE NOT NULL; cron_expression TEXT NOT NULL; timezone TEXT NULL; created_at.
  - Indexes: (fee_id), (cron_job_name).
- memories.documents
  - id UUID PK; chat_id TEXT; doc_type TEXT CHECK IN ('contract','invoice','other'); source_kind TEXT CHECK IN ('text','url'); source_value TEXT; parsed JSONB NULL; created_at.
  - Indexes: (chat_id), (doc_type, chat_id).
- memories.notification_settings
  - chat_id TEXT PK; email TEXT NOT NULL; email_enabled BOOLEAN DEFAULT true; calendar_provider TEXT DEFAULT 'google'; default_reminder_minutes INT DEFAULT 60; created_at/updated_at.
- memories.fee_calendar_events
  - id UUID PK; fee_id UUID FK; external_event_id TEXT NOT NULL; external_calendar_id TEXT NULL; provider TEXT DEFAULT 'google'; created_at.
  - Indexes: (fee_id), (external_event_id).

Notes:
- Use same “LLM-owned schema” pattern as existing `memories` in the initial migration. Keep PII minimal (email only).
- Keep all records keyed by `chat_id` for alignment with RLS-bound access and delivery paths.

## Natural-DB Orchestrator (`supabase/functions/natural-db/index.ts`)
- MCP client bootstrap:
  - If `ZAPIER_MCP_URL` is set, initialize once at module scope using `experimental_createMCPClient`. On cold start, call `listTools()` and cache a map of available Zapier actions we care about (email send, calendar create/delete).
- Tools wiring:
  - Inject `cronCallbackUrl` for scheduled posts as `supabaseUrl/functions/v1/natural-db` (self-callback) and `callbackUrl` for Telegram delivery as `supabaseUrl/functions/v1/telegram-outgoing`.
  - Compose `createTools` with new domain tools (fees_*, docs_*, notifications_*, calendar_*).
- Intent routing (light):
  - Use existing model call to route natural language to tool invocations. Prefer tool-first approach; no heavy rule-based parsing needed.
  - Add a small system directive reminding the model of available domain tools and examples (from PRD).
- Scheduled callback handling:
  - When `incomingMessageRole === 'system_routine_task'` and the `userPrompt` matches the standard “Send a fee reminder for fee_id=X and chat_id=Y”, fetch fee row + notification prefs and format reminder text:
    - “Today: {fee_type} fee is due{, {amount} {currency}}{. {note}}.”
  - Post to `telegram-outgoing`.
  - If `email_enabled`, call `notifications_send_email` for the same reminder (Zapier MCP).

## Tools layer (`supabase/functions/natural-db/tools.ts`)
Add domain tools by composing with existing utilities (`executeRestrictedSQL`, `executePrivilegedSQL`) and cron wrappers. Keep validation with Zod per existing pattern.

- fees_create({ fee_type, due_day, amount?, currency?, note? })
  - Insert into `memories.fees` with `chat_id`.
  - Compute monthly cron at 09:00 local; if `timezone` present in payload, convert to UTC hours; else run at UTC 09:00.
  - `schedule_prompt` with:
    - job_name: `fee_{feeId}` suffix per chat.
    - prompt_to_schedule: “Send a fee reminder for fee_id=X and chat_id=Y.”
  - Insert job metadata into `memories.fee_jobs`.
  - If `notification_settings.email_enabled` and email exists:
    - `notifications_send_email` for confirmation.
    - `calendar_create_event_for_fee` and persist to `memories.fee_calendar_events`.
  - Return a concise confirmation string to the model.

- fees_list_active()
  - SELECT active fees for current `chat_id`. Return a compact list for display.

- fees_cancel({ fee_id })
  - Mark `memories.fees.is_active = false`.
  - Lookup `fee_jobs` by `fee_id`, call `unschedule_prompt(job_name)`.
  - `calendar_cancel_event_for_fee({ fee_id })` and delete mapping row(s).
  - Return a concise confirmation.

- docs_store({ doc_type, source_kind, source_value })
  - Insert row in `memories.documents` with `chat_id`.
  - Return `{ document_id }`.

- docs_parse({ document_id })
  - Fetch document text/URL; call OpenAI to extract minimal structured fields (amount, currency, due date, parties).
  - Update `documents.parsed`.
  - Fallback: set `parsed.summary` on failure.

- docs_email_summary({ document_id, to? })
  - Load `documents.parsed` and `source_value`; format a short summary (HTML or text).
  - Call `notifications_send_email` to deliver.

- notifications_set_email_prefs({ email, email_enabled?, calendar_provider?, default_reminder_minutes? })
  - Upsert `memories.notification_settings` by `chat_id`.
  - Validate email with a simple regex; return error for invalid emails.

- notifications_send_email({ to?, subject, html?, text? })
  - Resolve recipient: `to` or fallback to `notification_settings.email` for this chat.
  - If no MCP configured, return an error that the model can surface (“email skipped; Telegram-only reminder active”).
  - Otherwise, call Zapier MCP email action; return normalized `{ status, providerMessageId? }`.

- calendar_create_event_for_fee({ fee_id, title? })
  - Read the fee row and `notification_settings` to compute the next event time (based on `due_day`, at 09:00 local or using `default_reminder_minutes` offset).
  - Call Zapier MCP calendar create; store mapping in `memories.fee_calendar_events`.

- calendar_cancel_event_for_fee({ fee_id })
  - Lookup mapping; call Zapier MCP calendar delete; remove mapping.

Implementation notes:
- Reuse the established cron helper already exposed in tools:
```startLine:endLine:/Users/macbookair/natural-db/supabase/functions/natural-db/tools.ts
87:161
// schedule_prompt tool signature and body
```
- Keep tool return values short JSON or strings; avoid leaking provider internals.

## Telegram functions
- `telegram-input/index.ts`:
  - No structural changes required. It already:
    - validates webhook secret and allowlist,
    - bootstraps RLS-bound clients and chat membership,
    - invokes `natural-db` with `{ userPrompt, id, userId, metadata, timezone, callbackUrl }`.
- `telegram-outgoing/index.ts`:
  - No change needed; it already rechecks allowlist and membership, then posts to Telegram.

## Configuration
- Env vars:
  - `ZAPIER_MCP_URL` required to enable MCP-backed email/calendar.
  - Existing: `SUPABASE_*`, `TELEGRAM_*`, `OPENAI_API_KEY`, optional `OPENAI_MODEL`.
- Local dev:
  - `deno task dev` to start Supabase.
  - Apply migrations: `supabase db push`.
  - Serve functions: `deno task serve`.
  - Deploy: `deno task deploy`.

## Error handling and fallbacks
- Invalid email → return validation error; model asks user to re-enter.
- MCP unavailable or tool failure → continue with Telegram-only flow; tool returns error; model informs user email/calendar were skipped.
- Duplicate fee schedules → allow duplicates; include `note` for disambiguation; list includes IDs so users can cancel specific ones.
- Timezone missing → existing onboarding flow in `telegram-input` sets timezone; if absent, default cron at 09:00 UTC with a copy note.

## Observability
- Log tool start/end and result status (success/failure + brief message).
- Measure p95 latency per Edge Function and tool calls (basic timing logs).
- Track MCP error rate; alert if error spike is detected (simple count logging initially).

## Acceptance tests (MVP)
- Save prefs → row in `memories.notification_settings`.
- Create fee with email enabled →:
  - fee row inserted; cron job scheduled; `fee_jobs` row present;
  - confirmation email sent (MCP);
  - calendar event created; `fee_calendar_events` row present.
- Cron fire → Telegram reminder delivered; if email enabled, email reminder sent.
- List fees → returns active reminders with correct details.
- Cancel fee → `is_active=false`, cron unscheduled, external event canceled, confirmation message sent; optional email cancellation.
- Documents → store text/URL; parse updates `parsed`; `docs_email_summary` sends email.

## Security and privacy
- Preserve existing allowlist checks in `telegram-input` and `telegram-outgoing`.
- Keep PII to email only in `memories.notification_settings`.
- Use RLS-bound access for user data; `memories_role` for LLM-owned tables (guarded via `executeRestrictedSQL`).
- No provider tokens stored; Zapier MCP handles auth.

## Risks and mitigations
- Timezone accuracy: store tz at fee creation; compute next run in UTC; document limitation; allow user to adjust timezone later.
- Zapier MCP variability: robust error copy, fall back to Telegram-only.
- Parsing inconsistencies: minimal schema; include summary fallback; allow re-parse.

## Rollback plan
- Feature flag behavior: if MCP erroring, email/calendar paths naturally no-op.
- Down migration: drop new `memories.*` tables (data loss acceptable for MVP).
- Disable tools from model by removing them from `createTools` wiring if needed.

- Implemented plan aligns with:
  - `tools.ts` cron helpers for scheduling/unscheduling,
  - `db-utils.ts` restricted/privileged SQL lanes,
  - existing Telegram pipeline and RLS posture,
  - PRD’s minimal surface and success criteria.

- Next actions I’d take:
  - Add the migration file for new `memories` tables.
  - Extend `tools.ts` with the new domain tools.
  - Add MCP bootstrap and `system_routine_task` handler in `natural-db/index.ts`.
  - QA locally with `supabase db push` and `deno task serve`.

## Multi-Tenancy Architecture

Your current system appears designed for single-user deployment. For real estate CS bots, you need tenant isolation and tenant-aware RLS across core tables.

```sql
-- Add tenant isolation to all tables
ALTER TABLE profiles ADD COLUMN tenant_id UUID;
ALTER TABLE chats ADD COLUMN tenant_id UUID;
ALTER TABLE messages ADD COLUMN tenant_id UUID;

-- Create tenant-specific RLS policies
CREATE POLICY "tenant_isolation" ON profiles
    USING (tenant_id = (SELECT current_setting('app.current_tenant_id')::UUID));
```
