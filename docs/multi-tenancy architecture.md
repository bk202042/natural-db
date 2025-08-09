### Prerequisites for multi-tenancy (Supabase-safe)

- **Decide tenant model**
  - One org = one tenant; a `tenant_id` UUID keys isolation.
  - Each `chat` belongs to exactly one `tenant`.

- **Create core tenant tables**
  - `tenants` and `tenant_memberships` (map `auth.users(id)` to `tenant_id`, plus roles).
  - Ensure you can resolve a user’s active tenant for a given chat.

- **Add tenant_id columns (all tenant-scoped tables)**
  - Existing: `profiles`, `chats`, `messages`.
  - New MVP tables: `memories.fees`, `memories.fee_jobs`, `memories.documents`, `memories.notification_settings`, `memories.fee_calendar_events`.
  - Backfill `tenant_id` for existing rows; plan to enforce `NOT NULL` later.
  - Add supporting indexes: `(tenant_id)`, and composite where relevant (e.g., `(tenant_id, chat_id)`).

- **Introduce a stable current-tenant resolver (avoid session GUCs)**
  - Supabase uses transaction pooling, so per-session `set_config` is unreliable.
  - Use a stable function that reads tenant from JWT claims or request header:
    ```sql
    create or replace function auth.current_tenant_id() returns uuid
    language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id',
        current_setting('request.header.x-tenant-id', true)
      )::uuid
    $$;
    ```
  - Prefer embedding `tenant_id` in JWT at login; fallback to sending `x-tenant-id` header from Edge Functions.

- **Update RLS policy template (all tenant tables)**
  - Enable RLS if not already.
  - Use the stable resolver function:
    ```sql
    alter table profiles enable row level security;
    create policy tenant_isolation on profiles
      using (tenant_id = auth.current_tenant_id());

    alter table chats enable row level security;
    create policy tenant_isolation on chats
      using (tenant_id = auth.current_tenant_id());

    alter table messages enable row level security;
    create policy tenant_isolation on messages
      using (tenant_id = auth.current_tenant_id());
    ```
  - Repeat analogous policies for all `memories.*` tables you tenant-scope.

- **JWT and headers wiring**
  - If using JWT claim: ensure sign-in flow sets `tenant_id` in JWT (via app metadata or a custom sign-in path).
  - If using header: set `x-tenant-id` from your Edge Functions/Supabase client on every request.

- **Cron/scheduled tasks propagation**
  - Include `tenant_id` in scheduled payloads and callbacks so the handler can:
    - set `x-tenant-id` header on DB calls, or
    - query only with `tenant_id` filters.
  - Store `tenant_id` on `fee_jobs` to simplify reminder handling.

- **Constraints and consistency**
  - Add FKs where applicable: e.g., `chats.tenant_id` → `tenants.id`, and cascade rules that fit your deletion policy.
  - Add unique constraints scoped by tenant (e.g., `unique(tenant_id, external_chat_id)` if needed).

- **Backfill plan**
  - Migrate in phases: add columns nullable → backfill → add indexes → enable RLS → add policies → flip to `NOT NULL` when ready.

- **App/Function changes**
  - Resolve and pass `tenant_id` at the top of request handling (Telegram webhook mapping).
  - Ensure all SQL and tool calls include tenant context (filter by `tenant_id` or rely on RLS with correct JWT/header).

- **Testing**
  - Create two tenants with overlapping `chat_id` values to verify isolation.
  - Verify cron reminders and document flows don’t leak across tenants.

- **Observability**
  - Log `tenant_id` in structured logs to trace multi-tenant operations safely (no PII beyond IDs).

- **Security**
  - Service-role code must still pass `x-tenant-id` or set JWT with `tenant_id` to avoid cross-tenant access when RLS is bypassed.

- **Docs update**
  - Note that `current_setting('app.current_tenant_id')` is not reliable under transaction pooling; prefer `auth.current_tenant_id()` as above.

- **Optional but recommended**
  - Add a guard function `ensure_same_tenant(a uuid, b uuid)` for join-heavy RPCs to assert tenant equality and raise early.

- **Minimal migration scaffolding**
  - Create `tenants` and `tenant_memberships`:
    ```sql
    create table if not exists public.tenants (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_at timestamptz default now()
    );

    create table if not exists public.tenant_memberships (
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null check (role in ('owner','admin','member')),
      primary key (tenant_id, user_id),
      created_at timestamptz default now()
    );
    ```

- **Headers usage (client)**
  - Example Supabase client:
    ```ts
    const supabase = createClient(url, anonKey, { global: { headers: { 'x-tenant-id': tenantId } } });
    ```

- **JWT claim usage (policies)**
  - Policy can read directly: `(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`.

- **RLS for memories tables (template)**
  - Example:
    ```sql
    alter table memories.fees enable row level security;
    create policy tenant_isolation on memories.fees
      using (tenant_id = auth.current_tenant_id());
    ```

- **Backfill script reminder**
  - For existing rows, compute `tenant_id` via join from `chats` or membership mapping and update all dependent tables accordingly.

- **Telegram pipeline**
  - Persist `tenant_id` with `chats` and include it in all orchestrator calls and scheduled messages.

- **pg_cron + pg_net**
  - Ensure scheduled jobs either:
    - call an Edge Function that sets `x-tenant-id`, or
    - include `tenant_id` in the job payload for the same effect.

- **Rollout safety**
  - Feature-flag RLS enablement per table in lower environments before production.

- **What I’ll implement next (once you confirm)**
  - Extend RLS examples to `chats` and `messages` plus all `memories.*` tables.
  - Add `auth.current_tenant_id()` helper and switch docs/policies to it.
  - Add concise notes in `ARCHITECTURE.md` about tenant resolution and headers/JWT.
