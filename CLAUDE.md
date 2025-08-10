# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Natural-DB is an AI personal assistant with persistent memory and autonomous intelligence, built on Supabase. The system combines an LLM with a dedicated Postgres schema, scheduled tasks, web search capabilities, and MCP integrations to create a personalized assistant capable of long-term memory retention.

## Core Architecture

### Database Architecture
- **Supabase Postgres** with specialized schemas:
  - `public` schema: User profiles, chats, messages, system prompts
  - `memories` schema: LLM-controlled workspace with scoped permissions
  - **Role-based security**: `memories_role` has exclusive access to `memories` schema
  - **Vector embeddings**: Uses pgvector for semantic message search (1536 dimensions)

### Edge Functions Structure
- **natural-db/**: Main AI processing engine with database operations and tool integration
- **telegram-input/**: Webhook handler for incoming Telegram messages 
- **telegram-outgoing/**: Response formatter and delivery system

### Memory System
Three complementary memory types maintain conversation continuity:
- **Message History**: Chronological recent messages for context
- **Semantic Memory**: Vector embeddings using pgvector for concept retrieval  
- **Structured Memory**: LLM-created SQL tables for precise data queries

## Development Commands

### Supabase CLI Operations
```bash
# Login and link project
supabase login
supabase link --project-ref <YOUR-PROJECT-ID>

# Database operations
supabase db push                    # Apply migrations
supabase db reset                   # Reset local database
supabase start                      # Start local development stack
supabase stop                       # Stop local services

# Edge Functions
supabase functions deploy --no-verify-jwt    # Deploy all functions
supabase functions serve                     # Serve functions locally
```

### Local Development
```bash
# Start local Supabase stack (runs on ports 54321-54327)
supabase start

# Deploy specific function
supabase functions deploy natural-db --no-verify-jwt
supabase functions deploy telegram-input --no-verify-jwt  
supabase functions deploy telegram-outgoing --no-verify-jwt
```

## Required Environment Variables

### Edge Functions Environment Variables
Set in Supabase Dashboard → Project Settings → Edge Functions:

**Required:**
- `OPENAI_API_KEY`: OpenAI API key for LLM processing
- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather  
- `ALLOWED_USERNAMES`: Comma-separated Telegram usernames
- `TELEGRAM_WEBHOOK_SECRET`: Webhook validation secret

**Optional:**
- `OPENAI_MODEL`: Model name (defaults to "gpt-4.1-mini")

**Zapier MCP Integration (Optional):**
- `ZAPIER_MCP_URL`: MCP server URL for Zapier integrations (e.g., https://mcp.zapier.com/api/mcp/mcp)
- `ZAPIER_MCP_AUTH_TOKEN`: Authorization token for Zapier MCP server

### Local Development
Add to `.env.local`:
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-start-output>
OPENAI_API_KEY=<your-openai-key>
```

## Key Implementation Details

### Database Security Model
- `memories_role` has exclusive CREATE/READ/WRITE access to `memories` schema only
- Service role can assume `memories_role` for LLM operations
- Public schema uses RLS policies for user data protection
- Resource limits prevent runaway queries (5s statement timeout)

### Message Flow Architecture
1. **Telegram Input** → Webhook validation → User authentication
2. **Natural-DB Processing** → Context loading → LLM generation → Tool execution  
3. **Telegram Output** → Response formatting → Message delivery

### Scheduling System
- Uses `pg_cron` for autonomous task execution
- Scheduled prompts call same edge functions as regular messages
- Supports both one-time (ISO timestamps) and recurring (cron syntax) tasks

### Tool Integration Pattern
The system creates a unified tool interface combining:
- Built-in database operations (`execute_sql`, `schedule_prompt`)
- OpenAI web search capabilities  
- Optional MCP tools (Zapier integrations)

## File Structure Context

### Core Function Files
- `supabase/functions/natural-db/index.ts`: Main AI orchestration and context management
- `supabase/functions/natural-db/db-utils.ts`: Database operations and SQL execution
- `supabase/functions/natural-db/tools.ts`: Tool definitions and implementations

### Migration Files
- `supabase/migrations/20250623120000_create_initial_schema.sql`: Complete database schema setup including extensions, tables, RLS policies, and role configuration

### Configuration
- `supabase/config.toml`: Local development configuration with service ports and settings

## Development Best Practices

### Database Operations
- Always use parameterized queries to prevent SQL injection
- Test schema changes locally before deploying
- Use `COMMENT ON TABLE/COLUMN` for self-documenting schemas
- Leverage `memories_role` constraints for LLM safety

### Edge Function Development  
- Functions use Deno runtime with npm: imports
- Handle errors gracefully with proper HTTP status codes
- Validate input schemas using Zod
- Use TypeScript for type safety

## Deno Runtime and Dependencies

### Why IDE Warnings Appear
Edge Functions run in Deno runtime, which handles dependencies differently than Node.js:
- **npm: imports**: Functions use `npm:@ai-sdk/openai`, `npm:zod` syntax
- **IDE confusion**: Code editors expect `node_modules` but Deno resolves packages at runtime
- **No package.json**: Deno doesn't use traditional npm package management
- **Warnings are harmless**: Functions work perfectly despite IDE warnings

### Deno Dependency Management
- **Automatic resolution**: `npm:` packages are downloaded and cached at runtime
- **URL imports**: Direct imports like `https://deno.land/x/postgres@v0.17.0/mod.ts`
- **No installation needed**: No npm, yarn, or package manager required
- **Global caching**: Dependencies cached globally by Deno runtime

### Deno Configuration (`deno.json`)
```json
{
  "compilerOptions": {
    "allowJs": true,
    "lib": ["deno.window", "dom"]
  },
  "imports": {
    "@ai-sdk/openai": "npm:@ai-sdk/openai",
    "ai": "npm:ai",
    "zod": "npm:zod",
    "@supabase/supabase-js": "npm:@supabase/supabase-js"
  },
  "tasks": {
    "dev": "supabase start",
    "deploy": "supabase functions deploy --no-verify-jwt"
  }
}
```

### IDE Setup for Deno
For VS Code, create `.vscode/settings.json`:
```json
{
  "deno.enable": true,
  "deno.unstable": true,
  "typescript.preferences.includePackageJsonAutoImports": "off"
}
```

### Security Considerations
- Telegram webhook validation prevents unauthorized access
- Username allowlists control system access
- Database role separation limits LLM capabilities
- No sensitive data in environment variables (use Supabase secrets)

## Testing and Debugging

### Local Testing
```bash
# Test specific function locally
curl -X POST "http://127.0.0.1:54321/functions/v1/natural-db" \
  -H "Content-Type: application/json" \
  -d '{"userPrompt": "test message", "id": "test", "userId": "test-uuid"}'
```

### Production Monitoring  
- Use Supabase Dashboard → Functions → Logs for error tracking
- Monitor database performance via Dashboard → Database → Performance
- Check cron job execution in `cron.job_run_details` table

## Deployment Notes

- Edge Functions deploy globally and scale automatically
- Database migrations are applied via `supabase db push`  
- Environment variables must be set in Supabase Dashboard for production
- Telegram webhook URL format: `https://[PROJECT].supabase.co/functions/v1/telegram-input`