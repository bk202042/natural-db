-- Tenant Isolation Smoke Test
-- This test verifies that tenant isolation is properly enforced across all tables
-- and that tenants cannot access each other's data even when sharing chat_ids

-- Clean up any existing test data
DELETE FROM public.profiles WHERE username LIKE 'tenant_test_%';
DELETE FROM public.tenants WHERE name LIKE 'Test Tenant %';

-- ============================================================================
-- SETUP: Create test tenants and users
-- ============================================================================

-- Create two test tenants
INSERT INTO public.tenants (id, name) VALUES 
('11111111-1111-1111-1111-111111111111', 'Test Tenant A'),
('22222222-2222-2222-2222-222222222222', 'Test Tenant B');

-- Create test auth users (simulated)
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tenant_a@example.com', NOW(), NOW()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tenant_b@example.com', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create tenant memberships
INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner');

-- Create profiles in different tenants but with SAME chat_id
INSERT INTO public.profiles (id, auth_user_id, service_id, username, tenant_id) VALUES
('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1001, 'tenant_test_user_a', '11111111-1111-1111-1111-111111111111'),
('bbbb0001-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1002, 'tenant_test_user_b', '22222222-2222-2222-2222-222222222222');

-- Create chats with SAME chat_id in different tenants (this is the key test case)
INSERT INTO public.chats (id, title, created_by, tenant_id) VALUES
('shared_chat_123', 'Tenant A Chat', 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
('shared_chat_123', 'Tenant B Chat', 'bbbb0001-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222');

-- Create chat memberships
INSERT INTO public.chat_users (chat_id, user_id, tenant_id) VALUES
('shared_chat_123', 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
('shared_chat_123', 'bbbb0001-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222');

-- Create messages for each tenant
INSERT INTO public.messages (user_id, role, content, chat_id, tenant_id) VALUES
('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user', 'Secret message from Tenant A', 'shared_chat_123', '11111111-1111-1111-1111-111111111111'),
('bbbb0001-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user', 'Secret message from Tenant B', 'shared_chat_123', '22222222-2222-2222-2222-222222222222');

-- Create system prompts for each tenant
INSERT INTO public.system_prompts (chat_id, prompt_content, created_by_role, tenant_id) VALUES
('shared_chat_123', 'System prompt for Tenant A', 'system', '11111111-1111-1111-1111-111111111111'),
('shared_chat_123', 'System prompt for Tenant B', 'system', '22222222-2222-2222-2222-222222222222');

-- ============================================================================
-- TEST 1: Verify basic tenant isolation with RLS
-- ============================================================================

\echo '=== TEST 1: Basic RLS Tenant Isolation ==='

-- Test as Tenant A - should only see Tenant A data
SET request.header.x-tenant-id = '11111111-1111-1111-1111-111111111111';

-- Tenant A should see only their profiles
SELECT 'profiles' as table_name, username, tenant_id::text as tenant_id 
FROM public.profiles 
WHERE username LIKE 'tenant_test_%';

-- Tenant A should see only their chats
SELECT 'chats' as table_name, id, title, tenant_id::text as tenant_id
FROM public.chats 
WHERE id = 'shared_chat_123';

-- Tenant A should see only their messages
SELECT 'messages' as table_name, content, tenant_id::text as tenant_id
FROM public.messages 
WHERE chat_id = 'shared_chat_123';

-- Tenant A should see only their system prompts
SELECT 'system_prompts' as table_name, prompt_content, tenant_id::text as tenant_id
FROM public.system_prompts 
WHERE chat_id = 'shared_chat_123';

\echo '--- Switching to Tenant B context ---'

-- Test as Tenant B - should only see Tenant B data
SET request.header.x-tenant-id = '22222222-2222-2222-2222-222222222222';

-- Tenant B should see only their profiles
SELECT 'profiles' as table_name, username, tenant_id::text as tenant_id 
FROM public.profiles 
WHERE username LIKE 'tenant_test_%';

-- Tenant B should see only their chats
SELECT 'chats' as table_name, id, title, tenant_id::text as tenant_id
FROM public.chats 
WHERE id = 'shared_chat_123';

-- Tenant B should see only their messages
SELECT 'messages' as table_name, content, tenant_id::text as tenant_id
FROM public.messages 
WHERE chat_id = 'shared_chat_123';

-- Tenant B should see only their system prompts
SELECT 'system_prompts' as table_name, prompt_content, tenant_id::text as tenant_id
FROM public.system_prompts 
WHERE chat_id = 'shared_chat_123';

-- ============================================================================
-- TEST 2: Cross-tenant access attempt (should return no results)
-- ============================================================================

\echo '=== TEST 2: Cross-tenant Access Prevention ==='

-- Tenant A tries to access Tenant B's data explicitly (should fail)
SET request.header.x-tenant-id = '11111111-1111-1111-1111-111111111111';

SELECT 'cross_tenant_profiles' as test, count(*) as found_records
FROM public.profiles 
WHERE tenant_id = '22222222-2222-2222-2222-222222222222';

SELECT 'cross_tenant_messages' as test, count(*) as found_records
FROM public.messages 
WHERE tenant_id = '22222222-2222-2222-2222-222222222222';

-- ============================================================================
-- TEST 3: Verify auth.current_tenant_id() function works correctly
-- ============================================================================

\echo '=== TEST 3: Tenant ID Resolution Function ==='

-- Test with x-tenant-id header
SET request.header.x-tenant-id = '11111111-1111-1111-1111-111111111111';
SELECT 'header_method' as method, public.current_tenant_id()::text as resolved_tenant_id;

-- Test with different tenant
SET request.header.x-tenant-id = '22222222-2222-2222-2222-222222222222';
SELECT 'header_method' as method, public.current_tenant_id()::text as resolved_tenant_id;

-- Test with JWT claims (simulated)
SET request.jwt.claims = '{"tenant_id": "11111111-1111-1111-1111-111111111111"}';
RESET request.header.x-tenant-id;
SELECT 'jwt_method' as method, public.current_tenant_id()::text as resolved_tenant_id;

-- ============================================================================
-- TEST 4: Insert isolation test
-- ============================================================================

\echo '=== TEST 4: Insert Operations Respect Tenant Context ==='

-- Set tenant context and insert message
SET request.header.x-tenant-id = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.messages (user_id, role, content, chat_id, tenant_id) VALUES
('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'assistant', 'Response from Tenant A assistant', 'shared_chat_123', '11111111-1111-1111-1111-111111111111');

-- Verify Tenant A can see their new message
SELECT 'tenant_a_insert_check' as test, count(*) as messages_visible
FROM public.messages 
WHERE content LIKE '%Tenant A assistant%';

-- Switch to Tenant B context
SET request.header.x-tenant-id = '22222222-2222-2222-2222-222222222222';

-- Tenant B should NOT see Tenant A's assistant message
SELECT 'tenant_b_isolation_check' as test, count(*) as messages_visible
FROM public.messages 
WHERE content LIKE '%Tenant A assistant%';

-- ============================================================================
-- TEST 5: Verification function test
-- ============================================================================

\echo '=== TEST 5: Built-in Verification Function ==='

-- Test the verification function we created in the migration
SELECT * FROM public.verify_tenant_isolation('11111111-1111-1111-1111-111111111111');
SELECT * FROM public.verify_tenant_isolation('22222222-2222-2222-2222-222222222222');

-- ============================================================================
-- EXPECTED RESULTS SUMMARY
-- ============================================================================

\echo '=== EXPECTED RESULTS SUMMARY ==='
\echo 'TEST 1: Each tenant should only see their own data with same chat_id'
\echo 'TEST 2: Cross-tenant queries should return 0 records'
\echo 'TEST 3: Tenant ID resolution should work for both header and JWT methods'
\echo 'TEST 4: Inserts should be isolated per tenant context'
\echo 'TEST 5: Verification function should show isolation is working'
\echo ''
\echo 'SUCCESS CRITERIA:'
\echo '- Tenant A sees: "Secret message from Tenant A" and "System prompt for Tenant A"'
\echo '- Tenant B sees: "Secret message from Tenant B" and "System prompt for Tenant B"'
\echo '- Cross-tenant queries return 0 records'
\echo '- Tenant ID resolution matches set context'
\echo '- Insert isolation prevents cross-tenant data visibility'
\echo ''
\echo 'FAILURE INDICATORS:'
\echo '- Any tenant sees data from other tenant'
\echo '- Cross-tenant queries return > 0 records'
\echo '- Tenant ID resolution returns wrong/null values'
\echo '- Inserted data visible across tenant boundaries'

-- ============================================================================
-- CLEANUP (Optional - remove test data)
-- ============================================================================

-- Uncomment the following lines to clean up test data:
-- DELETE FROM public.profiles WHERE username LIKE 'tenant_test_%';
-- DELETE FROM public.tenants WHERE name LIKE 'Test Tenant %';
-- DELETE FROM auth.users WHERE email LIKE '%@example.com';

\echo '=== TENANT ISOLATION SMOKE TEST COMPLETE ==='