-- Fix set_config Function Migration
-- This migration creates a wrapper function for set_config to handle Supabase environment limitations
-- Resolves: "Could not find the function public.set_config" errors

-- ============================================================================
-- PHASE 1: Create Wrapper Function for set_config
-- ============================================================================

-- PostgreSQL's built-in set_config function may not be accessible in Supabase environment
-- Create a public wrapper that delegates to the built-in function
CREATE OR REPLACE FUNCTION public.set_config(
    setting_name text, 
    new_value text, 
    is_local boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Try to use PostgreSQL's built-in set_config function
    RETURN set_config(setting_name, new_value, is_local);
EXCEPTION
    WHEN others THEN
        -- Fallback: Use pg_catalog namespace explicitly
        PERFORM pg_catalog.set_config(setting_name, new_value, is_local);
        RETURN new_value;
END;
$$;

COMMENT ON FUNCTION public.set_config(text, text, boolean) IS 'Wrapper for PostgreSQL set_config function to handle Supabase environment limitations';

-- Grant execute permission to necessary roles
GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Test the function works
DO $$
BEGIN
    -- Test setting a configuration parameter
    PERFORM public.set_config('test.migration_check', 'success', true);
    
    -- Verify it was set
    IF current_setting('test.migration_check', true) = 'success' THEN
        RAISE NOTICE 'set_config wrapper function created and tested successfully';
    ELSE
        RAISE EXCEPTION 'set_config wrapper function test failed';
    END IF;
END $$;

-- Log the completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20250820120000_fix_set_config_function completed successfully';
    RAISE NOTICE 'public.set_config() wrapper function now available';
    RAISE NOTICE 'This resolves "Could not find function set_config" errors';
END $$;