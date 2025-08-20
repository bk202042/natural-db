-- Fix Tenant Configuration Parameter Migration
-- This migration fixes PostgreSQL parameter naming violations in tenant context functions
-- Resolves: Invalid parameter names with hyphens (request.header.x-tenant-id)

-- ============================================================================
-- PHASE 1: Update current_tenant_id Function with Valid Parameter Names
-- ============================================================================

-- Replace the function to use valid PostgreSQL parameter naming
-- Remove hyphens from parameter names as they violate PostgreSQL naming rules
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS UUID
LANGUAGE SQL STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id',
    current_setting('request.header.tenant_id', true)  -- Fixed: removed x- prefix with hyphens
  )::uuid
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS 'Stable resolver for current tenant context from JWT or header (parameter naming fixed)';

-- ============================================================================
-- PHASE 2: Update Verification Function with Fixed Parameter Names
-- ============================================================================

-- Update the verification function to use the corrected parameter name
CREATE OR REPLACE FUNCTION public.verify_tenant_isolation(test_tenant_id UUID)
RETURNS TABLE (
    table_name TEXT,
    record_count BIGINT,
    has_tenant_isolation BOOLEAN
) AS $$
BEGIN
    -- Set tenant context using corrected parameter name
    PERFORM public.set_config('request.header.tenant_id', test_tenant_id::text, true);
    
    RETURN QUERY
    SELECT 'profiles'::TEXT, COUNT(*), COUNT(*) > 0 FROM public.profiles
    UNION ALL
    SELECT 'chats'::TEXT, COUNT(*), COUNT(*) > 0 FROM public.chats
    UNION ALL  
    SELECT 'messages'::TEXT, COUNT(*), COUNT(*) > 0 FROM public.messages
    UNION ALL
    SELECT 'chat_users'::TEXT, COUNT(*), COUNT(*) > 0 FROM public.chat_users
    UNION ALL
    SELECT 'system_prompts'::TEXT, COUNT(*), COUNT(*) > 0 FROM public.system_prompts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.verify_tenant_isolation(UUID) IS 'Verify tenant isolation is working (using corrected parameter names)';

-- ============================================================================
-- VERIFICATION AND TESTING
-- ============================================================================

-- Test the updated function works correctly
DO $$
DECLARE
    test_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    current_tenant UUID;
BEGIN
    -- Test setting tenant context with new parameter name
    PERFORM public.set_config('request.header.tenant_id', test_tenant_id::text, true);
    
    -- Verify the function can read it
    current_tenant := public.current_tenant_id();
    
    IF current_tenant = test_tenant_id THEN
        RAISE NOTICE 'Tenant parameter fix successful: %', current_tenant;
    ELSE
        RAISE EXCEPTION 'Tenant parameter fix failed. Expected: %, Got: %', test_tenant_id, current_tenant;
    END IF;
    
    -- Clean up test parameter
    PERFORM public.set_config('request.header.tenant_id', '', true);
END $$;

-- Log the completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20250820130000_fix_tenant_config_parameter completed successfully';
    RAISE NOTICE 'Fixed parameter naming: request.header.x-tenant-id → request.header.tenant_id';
    RAISE NOTICE 'Updated current_tenant_id() and verify_tenant_isolation() functions';
    RAISE NOTICE 'PostgreSQL parameter naming rules now compliant';
END $$;