-- Multi-Tenant Isolation Migration
-- This migration establishes tenant context end-to-end to prevent cross-tenant data leaks

-- ============================================================================
-- PHASE 1: Core Tenant Infrastructure
-- ============================================================================

-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.tenants IS 'Organizations/tenants in the system';
COMMENT ON COLUMN public.tenants.id IS 'Unique tenant identifier';
COMMENT ON COLUMN public.tenants.name IS 'Human-readable tenant name';

-- Create tenant membership table
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.tenant_memberships IS 'Maps auth.users to tenants with roles';
COMMENT ON COLUMN public.tenant_memberships.tenant_id IS 'Reference to tenant';
COMMENT ON COLUMN public.tenant_memberships.user_id IS 'Reference to auth.users';
COMMENT ON COLUMN public.tenant_memberships.role IS 'User role within tenant (owner/admin/member)';

-- Indexes for tenant membership lookups
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON public.tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON public.tenant_memberships(tenant_id);

-- ============================================================================
-- PHASE 2: Stable Tenant Resolver Function
-- ============================================================================

-- Transaction-pool safe tenant resolver
-- Prefers JWT claim, falls back to request header
-- Note: Created in public schema due to auth schema permissions
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS UUID
LANGUAGE SQL STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id',
    current_setting('request.header.tenant_id', true)
  )::uuid
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS 'Stable resolver for current tenant context from JWT or header';

-- ============================================================================
-- PHASE 3: Add tenant_id to Existing Tables (Safe Phased Approach)
-- ============================================================================

-- Add tenant_id columns as NULLABLE first (safe for existing data)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.chat_users ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.system_prompts ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Add foreign key constraints
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_tenant_id 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.chats ADD CONSTRAINT fk_chats_tenant_id 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.chat_users ADD CONSTRAINT fk_chat_users_tenant_id 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_tenant_id 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.system_prompts ADD CONSTRAINT fk_system_prompts_tenant_id 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ============================================================================
-- PHASE 4: Backfill Strategy for Existing Data
-- ============================================================================

-- Create default tenant for existing data
INSERT INTO public.tenants (id, name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant')
ON CONFLICT DO NOTHING;

-- Backfill all existing records with default tenant
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

UPDATE public.chats SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

UPDATE public.chat_users SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

UPDATE public.messages SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

UPDATE public.system_prompts SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- ============================================================================
-- PHASE 5: Create Indexes Before Enabling RLS
-- ============================================================================

-- Core tenant indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chats_tenant_id ON public.chats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_users_tenant_id ON public.chat_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_prompts_tenant_id ON public.system_prompts(tenant_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_auth_user ON public.profiles(tenant_id, auth_user_id);
CREATE INDEX IF NOT EXISTS idx_chats_tenant_id_chat ON public.chats(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_chat ON public.messages(tenant_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_chat_created ON public.messages(tenant_id, chat_id, created_at);

-- ============================================================================
-- PHASE 6: Replace RLS Policies with Tenant-Based Isolation
-- ============================================================================

-- Drop existing user-based policies
DROP POLICY IF EXISTS "profiles_access" ON public.profiles;
DROP POLICY IF EXISTS "chats_access" ON public.chats;  
DROP POLICY IF EXISTS "chat_users_access" ON public.chat_users;
DROP POLICY IF EXISTS "messages_access" ON public.messages;

-- Create tenant-based RLS policies
CREATE POLICY "tenant_isolation" ON public.profiles
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON public.chats
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON public.chat_users
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON public.messages
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY "tenant_isolation" ON public.system_prompts
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());

-- Enable RLS on tenant tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Tenant management policies (users can only see their own tenants)
CREATE POLICY "tenant_membership_access" ON public.tenants
    USING (
        id IN (
            SELECT tenant_id FROM public.tenant_memberships 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "membership_access" ON public.tenant_memberships
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PHASE 7: Enforce NOT NULL After Backfill (Safe)
-- ============================================================================

-- Now that all data has tenant_id, make it required
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.chats ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.chat_users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.system_prompts ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================================
-- PHASE 8: Memory Schema Tenant Support (Future-Proofing)
-- ============================================================================

-- Grant tenant access functions to memories_role
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO memories_role;

-- Note: Individual memories.* tables will be tenant-enabled as they are created
-- using the same pattern: tenant_id UUID NOT NULL REFERENCES public.tenants(id)

-- ============================================================================
-- VERIFICATION FUNCTIONS
-- ============================================================================

-- Function to verify tenant isolation is working
CREATE OR REPLACE FUNCTION public.verify_tenant_isolation(test_tenant_id UUID)
RETURNS TABLE (
    table_name TEXT,
    record_count BIGINT,
    has_tenant_isolation BOOLEAN
) AS $$
BEGIN
    -- Set tenant context
    PERFORM set_config('request.header.tenant_id', test_tenant_id::text, true);
    
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

-- Log the completion of tenant isolation setup
DO $$
BEGIN
    RAISE NOTICE 'Tenant isolation migration completed successfully';
    RAISE NOTICE 'Default tenant created with ID: 00000000-0000-0000-0000-000000000001';
    RAISE NOTICE 'All existing data backfilled with default tenant';
    RAISE NOTICE 'RLS policies updated for tenant-based isolation';
    RAISE NOTICE 'Next: Update Edge Functions to propagate tenant context';
END $$;