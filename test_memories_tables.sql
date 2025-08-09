-- Test script for memories schema real estate tables
-- Run this after applying the migration to verify everything works

-- ============================================================================
-- VERIFICATION 1: Check all tables exist with proper structure
-- ============================================================================

\echo '=== MEMORIES SCHEMA TABLES VERIFICATION ==='

-- List all memories tables
SELECT schemaname, tablename, hasindexes, hasrules, hastriggers 
FROM pg_tables 
WHERE schemaname = 'memories'
ORDER BY tablename;

-- Check that all tables have tenant_id columns
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'memories' 
    AND column_name = 'tenant_id'
ORDER BY table_name;

-- ============================================================================
-- VERIFICATION 2: Test RLS policies are working
-- ============================================================================

\echo '=== RLS POLICIES VERIFICATION ==='

-- Check RLS is enabled on all memories tables
SELECT schemaname, tablename, rowsecurity, relname
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename 
WHERE t.schemaname = 'memories'
ORDER BY tablename;

-- List all RLS policies on memories tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'memories'
ORDER BY tablename, policyname;

-- ============================================================================
-- VERIFICATION 3: Test tenant isolation with sample data
-- ============================================================================

\echo '=== TENANT ISOLATION TEST ==='

-- Set tenant context to default tenant
SET request.header.x-tenant-id = '00000000-0000-0000-0000-000000000001';

-- Insert test data
INSERT INTO memories.fees (tenant_id, chat_id, fee_type, due_day, amount, currency, note) 
VALUES ('00000000-0000-0000-0000-000000000001', 'test_chat_123', 'electricity', 15, 120.50, 'USD', 'Monthly electricity bill');

INSERT INTO memories.notification_settings (tenant_id, chat_id, email, email_enabled) 
VALUES ('00000000-0000-0000-0000-000000000001', 'test_chat_123', 'test@example.com', true);

INSERT INTO memories.documents (tenant_id, chat_id, doc_type, source_kind, source_value, parsed)
VALUES ('00000000-0000-0000-0000-000000000001', 'test_chat_123', 'invoice', 'text', 'Sample invoice text', '{"amount": 120.50, "due_date": "2025-02-15"}');

-- Verify data is visible with tenant context
SELECT 'fees' as table_name, COUNT(*) as records FROM memories.fees;
SELECT 'notification_settings' as table_name, COUNT(*) as records FROM memories.notification_settings;
SELECT 'documents' as table_name, COUNT(*) as records FROM memories.documents;

-- ============================================================================
-- VERIFICATION 4: Test tenant data summary view
-- ============================================================================

\echo '=== TENANT DATA SUMMARY ==='

SELECT * FROM memories.tenant_data_summary;

-- ============================================================================
-- VERIFICATION 5: Test indexes exist
-- ============================================================================

\echo '=== INDEXES VERIFICATION ==='

-- Check tenant-scoped indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'memories' 
    AND indexname LIKE '%tenant%'
ORDER BY tablename, indexname;

-- ============================================================================
-- VERIFICATION 6: Test foreign key relationships
-- ============================================================================

\echo '=== FOREIGN KEY CONSTRAINTS ==='

SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'memories'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- CLEANUP TEST DATA (Optional)
-- ============================================================================

-- Uncomment to clean up test data:
-- DELETE FROM memories.documents WHERE chat_id = 'test_chat_123';
-- DELETE FROM memories.notification_settings WHERE chat_id = 'test_chat_123';
-- DELETE FROM memories.fees WHERE chat_id = 'test_chat_123';

\echo '=== MEMORIES TABLES VERIFICATION COMPLETE ==='

\echo ''
\echo 'SUCCESS CRITERIA:'
\echo '✓ All 5 memories tables exist with tenant_id columns'
\echo '✓ RLS enabled on all tables with tenant_isolation policies'
\echo '✓ Proper foreign key constraints to public.tenants'
\echo '✓ Indexes exist for tenant-scoped queries'
\echo '✓ Data insertion and querying works with tenant context'
\echo '✓ Tenant data summary view shows correct counts'
\echo ''
\echo 'READY FOR: Implementation of domain tools in tools.ts'