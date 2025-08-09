-- Memories Schema Real Estate Tables Migration
-- This migration creates tenant-scoped tables in the memories schema
-- for fee reminders, documents, notifications, and calendar integration

-- ============================================================================
-- PHASE 1: Memories Schema Fee Management Tables
-- ============================================================================

-- Create fees table for recurring fee reminders
CREATE TABLE IF NOT EXISTS memories.fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    fee_type TEXT NOT NULL CHECK (fee_type IN ('electricity', 'management', 'water', 'other')),
    amount NUMERIC(10, 2),
    currency TEXT DEFAULT 'USD',
    due_day SMALLINT NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
    note TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE memories.fees IS 'Recurring fee reminders with tenant isolation';
COMMENT ON COLUMN memories.fees.tenant_id IS 'Tenant context for data isolation';
COMMENT ON COLUMN memories.fees.chat_id IS 'Chat identifier for fee reminders';
COMMENT ON COLUMN memories.fees.fee_type IS 'Type of fee (electricity, management, water, other)';
COMMENT ON COLUMN memories.fees.amount IS 'Optional fee amount for display';
COMMENT ON COLUMN memories.fees.currency IS 'Currency code for amount display';
COMMENT ON COLUMN memories.fees.due_day IS 'Day of month when fee is due (1-31)';
COMMENT ON COLUMN memories.fees.note IS 'Optional note or description';
COMMENT ON COLUMN memories.fees.is_active IS 'Whether this fee reminder is currently active';

-- Create fee_jobs table to track scheduled cron jobs
CREATE TABLE IF NOT EXISTS memories.fee_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    fee_id UUID NOT NULL REFERENCES memories.fees(id) ON DELETE CASCADE,
    cron_job_name TEXT UNIQUE NOT NULL,
    cron_expression TEXT NOT NULL,
    timezone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE memories.fee_jobs IS 'Tracks scheduled cron jobs for fee reminders';
COMMENT ON COLUMN memories.fee_jobs.tenant_id IS 'Tenant context for data isolation';
COMMENT ON COLUMN memories.fee_jobs.fee_id IS 'Reference to the fee this job reminds about';
COMMENT ON COLUMN memories.fee_jobs.cron_job_name IS 'Unique job name in pg_cron system';
COMMENT ON COLUMN memories.fee_jobs.cron_expression IS 'Cron expression for scheduling';
COMMENT ON COLUMN memories.fee_jobs.timezone IS 'Timezone for cron execution';

-- Create documents table for contract/invoice storage
CREATE TABLE IF NOT EXISTS memories.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('contract', 'invoice', 'other')),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('text', 'url')),
    source_value TEXT NOT NULL,
    parsed JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE memories.documents IS 'Document storage with parsing capabilities';
COMMENT ON COLUMN memories.documents.tenant_id IS 'Tenant context for data isolation';
COMMENT ON COLUMN memories.documents.chat_id IS 'Chat where document was submitted';
COMMENT ON COLUMN memories.documents.doc_type IS 'Document type (contract, invoice, other)';
COMMENT ON COLUMN memories.documents.source_kind IS 'How document was provided (text or url)';
COMMENT ON COLUMN memories.documents.source_value IS 'Actual text content or URL';
COMMENT ON COLUMN memories.documents.parsed IS 'Parsed structured data from OpenAI';

-- Create notification_settings table for email/calendar preferences
CREATE TABLE IF NOT EXISTS memories.notification_settings (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    email TEXT NOT NULL,
    email_enabled BOOLEAN DEFAULT true,
    calendar_provider TEXT DEFAULT 'google' CHECK (calendar_provider IN ('google', 'outlook')),
    default_reminder_minutes INT DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, chat_id)
);

COMMENT ON TABLE memories.notification_settings IS 'Per-chat notification preferences with tenant isolation';
COMMENT ON COLUMN memories.notification_settings.tenant_id IS 'Tenant context for data isolation';
COMMENT ON COLUMN memories.notification_settings.chat_id IS 'Chat identifier for settings';
COMMENT ON COLUMN memories.notification_settings.email IS 'Email address for notifications';
COMMENT ON COLUMN memories.notification_settings.email_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN memories.notification_settings.calendar_provider IS 'Preferred calendar provider';
COMMENT ON COLUMN memories.notification_settings.default_reminder_minutes IS 'Default reminder time before due date';

-- Create fee_calendar_events table to track external calendar events
CREATE TABLE IF NOT EXISTS memories.fee_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    fee_id UUID NOT NULL REFERENCES memories.fees(id) ON DELETE CASCADE,
    external_event_id TEXT NOT NULL,
    external_calendar_id TEXT,
    provider TEXT DEFAULT 'google' CHECK (provider IN ('google', 'outlook')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE memories.fee_calendar_events IS 'Maps fees to external calendar events';
COMMENT ON COLUMN memories.fee_calendar_events.tenant_id IS 'Tenant context for data isolation';
COMMENT ON COLUMN memories.fee_calendar_events.fee_id IS 'Reference to fee this calendar event represents';
COMMENT ON COLUMN memories.fee_calendar_events.external_event_id IS 'Event ID in external calendar system';
COMMENT ON COLUMN memories.fee_calendar_events.external_calendar_id IS 'Calendar ID in external system';
COMMENT ON COLUMN memories.fee_calendar_events.provider IS 'Calendar provider (google, outlook)';

-- ============================================================================
-- PHASE 2: Indexes for Performance
-- ============================================================================

-- Core tenant indexes
CREATE INDEX IF NOT EXISTS idx_fees_tenant_id ON memories.fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fee_jobs_tenant_id ON memories.fee_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON memories.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant_id ON memories.notification_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fee_calendar_events_tenant_id ON memories.fee_calendar_events(tenant_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_fees_tenant_chat ON memories.fees(tenant_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_fees_tenant_active ON memories.fees(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fee_jobs_tenant_fee ON memories.fee_jobs(tenant_id, fee_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_chat ON memories.documents(tenant_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type ON memories.documents(tenant_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_fee_calendar_events_tenant_fee ON memories.fee_calendar_events(tenant_id, fee_id);

-- Unique indexes for business rules
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_jobs_cron_name ON memories.fee_jobs(cron_job_name);
CREATE INDEX IF NOT EXISTS idx_fee_calendar_events_external_id ON memories.fee_calendar_events(external_event_id);

-- ============================================================================
-- PHASE 3: Enable RLS and Apply Tenant Isolation Policies
-- ============================================================================

-- Enable RLS on all memories tables
ALTER TABLE memories.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories.fee_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories.fee_calendar_events ENABLE ROW LEVEL SECURITY;

-- Apply tenant isolation policies using the established pattern
CREATE POLICY "tenant_isolation" ON memories.fees
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON memories.fee_jobs
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON memories.documents
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON memories.notification_settings
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON memories.fee_calendar_events
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

-- ============================================================================
-- PHASE 4: Updated Triggers for Automatic Timestamps
-- ============================================================================

-- Create or update the update_updated_at_column function if needed
CREATE OR REPLACE FUNCTION memories.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers for tables with updated_at columns
CREATE TRIGGER update_fees_updated_at
    BEFORE UPDATE ON memories.fees
    FOR EACH ROW
    EXECUTE FUNCTION memories.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
    BEFORE UPDATE ON memories.notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION memories.update_updated_at_column();

-- ============================================================================
-- PHASE 5: Grant Permissions to memories_role
-- ============================================================================

-- Grant necessary permissions to memories_role for LLM operations
GRANT ALL PRIVILEGES ON TABLE memories.fees TO memories_role;
GRANT ALL PRIVILEGES ON TABLE memories.fee_jobs TO memories_role;
GRANT ALL PRIVILEGES ON TABLE memories.documents TO memories_role;
GRANT ALL PRIVILEGES ON TABLE memories.notification_settings TO memories_role;
GRANT ALL PRIVILEGES ON TABLE memories.fee_calendar_events TO memories_role;

-- Grant sequence permissions (for default UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA memories TO memories_role;

-- Grant function permissions
GRANT EXECUTE ON FUNCTION memories.update_updated_at_column() TO memories_role;

-- ============================================================================
-- PHASE 6: Verification Views (Optional - for debugging)
-- ============================================================================

-- Create a view to check tenant isolation is working across memories tables
CREATE OR REPLACE VIEW memories.tenant_data_summary AS
SELECT 
    t.name as tenant_name,
    t.id as tenant_id,
    (SELECT COUNT(*) FROM memories.fees f WHERE f.tenant_id = t.id) as fees_count,
    (SELECT COUNT(*) FROM memories.fee_jobs fj WHERE fj.tenant_id = t.id) as fee_jobs_count,
    (SELECT COUNT(*) FROM memories.documents d WHERE d.tenant_id = t.id) as documents_count,
    (SELECT COUNT(*) FROM memories.notification_settings ns WHERE ns.tenant_id = t.id) as notification_settings_count,
    (SELECT COUNT(*) FROM memories.fee_calendar_events fce WHERE fce.tenant_id = t.id) as calendar_events_count
FROM public.tenants t
ORDER BY t.created_at;

COMMENT ON VIEW memories.tenant_data_summary IS 'Summary view for verifying tenant isolation across memories tables';

-- Grant view access to memories_role
GRANT SELECT ON memories.tenant_data_summary TO memories_role;

-- ============================================================================
-- VERIFICATION AND LOGGING
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Memories schema real estate tables created successfully';
    RAISE NOTICE 'Tables created: fees, fee_jobs, documents, notification_settings, fee_calendar_events';
    RAISE NOTICE 'All tables have tenant_id columns with proper foreign key constraints';
    RAISE NOTICE 'RLS policies applied using public.current_tenant_id() function';
    RAISE NOTICE 'Indexes created for optimal tenant-scoped queries';
    RAISE NOTICE 'Permissions granted to memories_role for LLM operations';
    RAISE NOTICE 'Next: Update tools.ts to expose new domain-specific tools';
END $$;