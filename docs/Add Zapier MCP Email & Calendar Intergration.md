# Plan: Add Zapier MCP Email & Calendar Integration to Natural-DB

## Overview
This plan will add Zapier MCP (Managed Component Provider) integration to enable email notifications and calendar event management for your real estate CS bot. The integration builds on your existing fee management system and document processing capabilities.

## Current Status
- [x] Database schema already complete - tables created in migration `20250809010000_add_memories_realestate_tables.sql`
- [x] Real estate domain tools already scaffolded in `tools.ts` with placeholder MCP integration comments
- [x] Tenant isolation and RLS policies properly implemented

## Implementation Steps

### Step 1: Update Dependencies & Environment
- Add `@ai-sdk/mcp` and related MCP packages to `deno.json` imports.
- Document new required environment variable: `ZAPIER_MCP_URL` in `CLAUDE.md`.
- Verify MCP server URL format and authentication requirements.

### Step 2: Create MCP Client Bootstrap
- **File:** `supabase/functions/natural-db/mcp-client.ts`
- Create an MCP client factory with connection management.
- Add error handling and fallback logic for when MCP is unavailable.
- Implement tool discovery to map Zapier email and calendar actions.
- Cache available tools to avoid repeated discovery calls.

### Step 3: Enhance Tools with Real MCP Integration
- **File:** `supabase/functions/natural-db/tools.ts`
- Replace placeholder implementations in:
    - `notifications_send_email` - integrate with Zapier email action.
    - `calendar_create_event_for_fee` - integrate with calendar creation.
    - `calendar_cancel_event_for_fee` - integrate with calendar deletion.
    - `docs_email_summary` - complete email functionality.
- Add proper error handling and graceful fallbacks.
- Implement email validation and calendar provider routing.

### Step 4: Update Main Orchestrator
- **File:** `supabase/functions/natural-db/index.ts`
- Bootstrap MCP client on startup if `ZAPIER_MCP_URL` is set.
- Pass the MCP client instance to the tools factory.
- Add structured logging for MCP operations.
- Implement a circuit breaker pattern for MCP failures.

### Step 5: Enhanced Fee Creation Flow
- **File:** `supabase/functions/natural-db/tools.ts`
- Update the `fees_create` tool to:
    - Send a confirmation email when `email_enabled = true`.
    - Create recurring calendar events via Zapier MCP.
    - Store external event IDs in the `fee_calendar_events` table.
- Update the system routine task handler for monthly reminders to:
    - Send both Telegram and email reminders.
    - Include contextual information and a call-to-action.

### Step 6: Document Parsing with AI Integration
- Enhance the `docs_parse` tool with OpenAI structured extraction.
- Add schema validation for parsed document fields.
- Implement `docs_email_summary` with rich HTML formatting.
- Support both text and URL document sources.

### Step 7: Testing & Validation
- Test MCP connection and tool discovery.
- Validate email sending with various providers.
- Test calendar event creation and cancellation.
- Verify tenant isolation works with new MCP features.
- Test graceful fallbacks when MCP is unavailable.

### Step 8: Documentation Updates
- Update `CLAUDE.md` with new environment variables.
- Document MCP integration patterns for future extensions.
- Add a troubleshooting guide for common MCP issues.
- Update acceptance criteria with MCP-specific tests.

## Key Technical Considerations

### Security & Privacy
- Store minimal PII (only email addresses in `notification_settings`).
- Implement email validation with regex patterns.
- Use tenant-isolated queries for all MCP operations.
- Log high-level outcomes only, not sensitive data.

### Error Handling Strategy
- Graceful degradation when the MCP server is unavailable.
- Clear user messaging about email/calendar feature status.
- Retry logic for transient MCP failures.
- Fallback to Telegram-only functionality.

### Performance Optimizations
- Cache MCP tool discovery results.
- Implement connection pooling for the MCP client.
- Use background processing for non-critical email sends.
- Add a circuit breaker for failing MCP services.

## Success Metrics
- Email confirmation is sent on fee creation (when enabled).
- Monthly reminders are sent via both Telegram and email.
- Calendar events are created and properly linked to fees.
- Document summaries are emailed with structured data.
- Maintain a `<2%` tool/integration error rate.
- Graceful fallback successfully maintains Telegram functionality during outages.

## Risk Mitigations
- **MCP server availability:** Implement a robust fallback to Telegram-only mode.
- **Email deliverability:** Provide clear user feedback on send status.
- **Calendar provider differences:** Abstract provider-specific logic.
- **Tenant data isolation:** Conduct comprehensive testing of RLS policies.

***

This plan leverages your existing architecture while adding the requested MCP integration in a secure, tenant-aware manner.