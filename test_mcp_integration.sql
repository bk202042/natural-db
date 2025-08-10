-- Test MCP Integration for Natural-DB
-- This file contains SQL queries to test the Zapier MCP integration

-- Test 1: Set up email notification preferences
-- This would be executed via the notifications_set_email_prefs tool
-- INSERT INTO memories.notification_settings (tenant_id, chat_id, email, email_enabled, calendar_provider, default_reminder_minutes)
-- VALUES ('01234567-89ab-cdef-0123-456789abcdef', 'test-chat', 'test@example.com', true, 'google', 60)
-- ON CONFLICT (tenant_id, chat_id) DO UPDATE SET
--   email = EXCLUDED.email,
--   email_enabled = EXCLUDED.email_enabled,
--   calendar_provider = EXCLUDED.calendar_provider,
--   default_reminder_minutes = EXCLUDED.default_reminder_minutes,
--   updated_at = NOW();

-- Test 2: Create a test fee reminder
-- This would be executed via the fees_create tool
-- INSERT INTO memories.fees (tenant_id, chat_id, fee_type, due_day, amount, currency, note, is_active)
-- VALUES ('01234567-89ab-cdef-0123-456789abcdef', 'test-chat', 'electricity', 15, 125.50, 'USD', 'Monthly electricity bill', true);

-- Test 3: Check notification settings are working
SELECT 
    ns.chat_id,
    ns.email,
    ns.email_enabled,
    ns.calendar_provider,
    ns.default_reminder_minutes
FROM memories.notification_settings ns
WHERE ns.tenant_id = '01234567-89ab-cdef-0123-456789abcdef';

-- Test 4: Check fees are created properly
SELECT 
    f.id,
    f.fee_type,
    f.due_day,
    f.amount,
    f.currency,
    f.note,
    f.is_active
FROM memories.fees f
WHERE f.tenant_id = '01234567-89ab-cdef-0123-456789abcdef'
ORDER BY f.created_at DESC;

-- Test 5: Check fee jobs are scheduled
SELECT 
    fj.fee_id,
    fj.cron_job_name,
    fj.cron_expression,
    f.fee_type,
    f.due_day
FROM memories.fee_jobs fj
JOIN memories.fees f ON fj.fee_id = f.id
WHERE fj.tenant_id = '01234567-89ab-cdef-0123-456789abcdef';

-- Test 6: Check calendar events are tracked
SELECT 
    fce.fee_id,
    fce.external_event_id,
    fce.provider,
    f.fee_type,
    f.due_day
FROM memories.fee_calendar_events fce
JOIN memories.fees f ON fce.fee_id = f.id
WHERE fce.tenant_id = '01234567-89ab-cdef-0123-456789abcdef';

-- Test 7: Check documents can be stored
-- This would be executed via the docs_store tool
-- INSERT INTO memories.documents (tenant_id, chat_id, doc_type, source_kind, source_value)
-- VALUES ('01234567-89ab-cdef-0123-456789abcdef', 'test-chat', 'invoice', 'text', 'Sample invoice content for testing');

-- Test 8: Check document parsing
SELECT 
    d.id,
    d.doc_type,
    d.source_kind,
    d.parsed IS NOT NULL as is_parsed
FROM memories.documents d
WHERE d.tenant_id = '01234567-89ab-cdef-0123-456789abcdef'
ORDER BY d.created_at DESC;

-- Cleanup queries (run these to reset test data)
-- DELETE FROM memories.fee_calendar_events WHERE tenant_id = '01234567-89ab-cdef-0123-456789abcdef';
-- DELETE FROM memories.fee_jobs WHERE tenant_id = '01234567-89ab-cdef-0123-456789abcdef';
-- DELETE FROM memories.fees WHERE tenant_id = '01234567-89ab-cdef-0123-456789abcdef';
-- DELETE FROM memories.documents WHERE tenant_id = '01234567-89ab-cdef-0123-456789abcdef';
-- DELETE FROM memories.notification_settings WHERE tenant_id = '01234567-89ab-cdef-0123-456789abcdef';