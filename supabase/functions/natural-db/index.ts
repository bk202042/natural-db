import { createOpenAI } from "npm:@ai-sdk/openai";
import { generateText } from "npm:ai";
import { z } from "npm:zod@3.25.76";
import {
  loadRecentAndRelevantMessages,
  insertMessage,
  generateEmbedding
} from "./db-utils.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import { createTools } from "./tools.ts";
import { MCPClientManager } from "./mcp-client.ts";

// Type definitions to resolve conflicts
type MessageData = {
  user_id: string;
  role: string;
  content: string;
  chat_id: string | number;
  tenant_id: string;
  embedding?: string;
};

// Type for loadRecentAndRelevantMessages function
type LoadMessagesFunction = (
  supabaseClient: SupabaseClient,
  userId: string,
  currentPrompt: string,
  maxChatHistory: number,
  maxRelevantMessages: number,
  chatId: string | number,
  tenantId: string
) => Promise<{
  chronologicalMessages: Array<{ role: string; content: string; created_at: string }>;
  relevantContext: Array<{ role: string; content: string; created_at: string; similarity_score?: number }>;
}>;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
const openaiModel = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey || !openaiApiKey) {
  throw new Error("Missing required environment variables");
}

const openai = createOpenAI({
  apiKey: openaiApiKey
});

// Create tenant-aware Supabase client factory.
// If an access token is provided, include it so RLS policies that rely on auth.uid() also work.
function createTenantSupabaseClient(tenantId: string, accessToken?: string) {
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers },
  });
}

// Create service-role client for privileged operations (migrations, cron, etc.)
function _createServiceRoleClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

const MAX_CHAT_HISTORY = 10;
const MAX_RELEVANT_MESSAGES = 5;

const IncomingPayloadSchema = z.object({
  userPrompt: z.string().min(1),
  id: z.union([z.string(), z.number()]),
  userId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timezone: z.string().nullable().optional(),
  tenantId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format"),
  incomingMessageRole: z.enum(["user", "assistant", "system", "system_routine_task"]),
  callbackUrl: z.string().url()
});

// Copy all the helper functions and main logic from the original file
// This is a simplified restoration - in practice, you'd want to restore the full file

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let raw: unknown = null;
  let callbackUrl: string | undefined;
  let metadata: Record<string, unknown> = {};

  try {
    raw = await req.json();
    const parsed = IncomingPayloadSchema.safeParse(raw);

    if (!parsed.success) {
      console.error("Invalid request body:", parsed.error);
      return new Response("Invalid request body", { status: 400 });
    }

    const { userPrompt, id, userId, tenantId, incomingMessageRole, timezone, metadata: parsedMetadata, callbackUrl: parsedCallbackUrl } = parsed.data;
    metadata = parsedMetadata || {};
    callbackUrl = parsedCallbackUrl;

    // Validate tenant context early
    if (!tenantId) {
      console.error("Missing tenant ID in request payload");
      return new Response("Missing tenant context", { status: 400 });
    }
    
    console.log("Processing request with context:", { 
      userId, 
      tenantId, 
      chatId: id.toString(), 
      messageRole: incomingMessageRole 
    });

    // Create tenant-aware Supabase client, propagating the caller Authorization if present
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || undefined;
    const bearerPrefix = "Bearer ";
    const accessToken = authHeader && authHeader.startsWith(bearerPrefix)
      ? authHeader.slice(bearerPrefix.length)
      : undefined;
    
    const supabase = createTenantSupabaseClient(tenantId, accessToken);
    
    // Create service role client for privileged operations (message insertion)
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { headers: { 'x-tenant-id': tenantId } },
    });

    // Load recent and relevant messages with tenant context
    const chatId = typeof id === 'string' ? id : id.toString();
    
    console.log("Loading messages with tenant context:", { chatId, userId, tenantId });
    
    // Call loadRecentAndRelevantMessages with all 7 required parameters
    let messageResults;
    try {
      messageResults = await (loadRecentAndRelevantMessages as LoadMessagesFunction)(
        supabase,
        userId,
        userPrompt,
        MAX_CHAT_HISTORY,
        MAX_RELEVANT_MESSAGES,
        chatId,
        tenantId
      );
    } catch (messageLoadError: unknown) {
      console.error("Message loading failed:", messageLoadError);
      // Return early with simplified response if messages fail to load
      const errorMessage = messageLoadError instanceof Error ? messageLoadError.message : "Unknown error";
      return new Response(JSON.stringify({
        status: "error",
        message: "Failed to load messages",
        error: errorMessage
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const { chronologicalMessages: recentMessages, relevantContext: relevantMessages } = messageResults;
    
    console.log("Message loading successful:", { 
      recentCount: recentMessages.length, 
      relevantCount: relevantMessages.length 
    });

    // Initialize MCP client if available (MUST be before system prompt)
    let mcpClient: MCPClientManager | undefined;
    try {
      // Check environment variables first with detailed logging
      const zapierMcpUrl = Deno.env.get("ZAPIER_MCP_URL");
      const zapierAuthToken = Deno.env.get("ZAPIER_MCP_AUTH_TOKEN");
      
      console.log("=== MCP Environment Debugging ===");
      console.log("All environment variables (filtered):", {
        ZAPIER_MCP_URL: zapierMcpUrl ? `${zapierMcpUrl.substring(0, 50)}...` : "NOT_SET",
        ZAPIER_MCP_AUTH_TOKEN: zapierAuthToken ? `${zapierAuthToken.substring(0, 20)}...` : "NOT_SET",
        hasUrl: !!zapierMcpUrl,
        hasToken: !!zapierAuthToken,
        urlLength: zapierMcpUrl?.length || 0,
        tokenLength: zapierAuthToken?.length || 0,
        urlMatches: zapierMcpUrl === "https://mcp.zapier.com/api/mcp/mcp",
        tokenStartsWithBearer: zapierAuthToken?.startsWith("Bearer ") || false
      });
      
      // Additional environment debugging
      const envDebug = Object.fromEntries(
        Object.entries(Deno.env.toObject())
          .filter(([key]) => key.includes("ZAPIER") || key.includes("MCP"))
          .map(([key, value]) => [key, value ? `${value.substring(0, 20)}...` : "EMPTY"])
      );
      console.log("Zapier/MCP related env vars:", envDebug);

      mcpClient = MCPClientManager.getInstance();
      console.log("MCP Client created, attempting initialization...");
      
      const initResult = await mcpClient.initialize(openai);
      console.log("MCP initialization result:", initResult);
      
      console.log("Final MCP status:", {
        available: mcpClient.isAvailable(),
        clientExists: !!mcpClient
      });
    } catch (error) {
      console.error("MCP initialization failed:", error);
      mcpClient = undefined;
    }

    // Get system prompt for this chat with tenant context
    const { data: systemPromptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("chat_id", chatId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    const systemPrompt = systemPromptData?.prompt_content ||
      `You are a focused real estate customer service bot with advanced email and calendar capabilities. You ONLY help with property-related tasks for tenants and agents.

       **WHAT YOU DO (Real Estate Only):**
       - Fee reminders: electricity, management, water, and other property expenses
       - Property document management: contracts and invoices only
       - Email notifications and calendar events for property-related deadlines
       - Property payment tracking and reminders
       - Automated email follow-ups for property-related communications
       - Calendar event creation for lease renewals, inspections, and payment due dates

       **WHAT YOU DON'T DO:**
       - General personal assistant tasks
       - Non-property related conversations  
       - Run tracking, meal planning, or personal productivity
       - General web searches unrelated to property management

       **Current Context:**
       - User timezone: ${timezone || 'UTC'}
       - Current time: ${new Date().toISOString()}
       - Email/Calendar Integration: ${mcpClient?.isAvailable() ? '🟢 ACTIVE via Zapier MCP' : '🟡 Mock mode (development)'}

       **Available Real Estate Tools & Capabilities:**
       ${mcpClient?.isAvailable() ? 
         `✅ FULL EMAIL & CALENDAR INTEGRATION:
          - Send professional emails for fee reminders and property updates
          - Create calendar events for rent due dates, lease renewals, inspections
          - Email summaries of property documents with key dates highlighted
          - Automated notification scheduling with email + calendar combo
          - Property management deadline tracking with multi-channel alerts
          - Professional email templates for tenant/agent communications` :
         `🛠️ DEVELOPMENT MODE (Mock Tools Active):
          - Fee reminders via Telegram with mock email confirmations
          - Property document storage and parsing  
          - Calendar event simulation for testing
          - Email functionality testing (responses simulated)`}

       **Communication Guidelines:**
       - Stay focused on property and real estate matters only
       - Proactively offer email and calendar integration for important dates
       - When creating reminders, ALWAYS suggest both email backup and calendar events
       - Use professional language appropriate for property management communications
       - If asked about non-property topics, politely redirect to property management

       **Email & Calendar Best Practices:**
       - For fee reminders: Create calendar event + email notification 3 days before due date
       - For lease renewals: Email summary + calendar event 30 days before expiration
       - For maintenance: Email confirmation + calendar follow-up appointment
       - For document storage: Email copy of important documents for backup

       **Example Proactive Responses:**
       - "I'll set up your electricity reminder and send you an email confirmation. Should I also add this to your calendar?"
       - "I've processed your lease agreement. Let me email you the key dates and create calendar events for renewal deadlines."
       - "I can send a professional email to your property manager about this issue and schedule a calendar reminder to follow up."

       **Example Redirections for Non-Property Questions:**
       - Personal tasks → "I'm specialized for property management with email and calendar tools. How can I help with your rental fees or property documents?"
       - General questions → "I focus on real estate services with professional communication tools. Do you need help with fee reminders, property emails, or calendar scheduling?"

       Always leverage email and calendar integration to provide comprehensive property management solutions.`;

    // Create tools with tenant context and MCP client
    console.log("Creating tools with tenant context:", { chatId, tenantId, mcpAvailable: mcpClient?.isAvailable() });
    const tools = createTools(supabase, chatId, tenantId, mcpClient);

    // Prepare messages array
    const messages = [
      ...recentMessages.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content
      })),
      { role: "user" as const, content: userPrompt as string }
    ];

    // Add relevant historical messages if any
    if (relevantMessages.length > 0) {
      const contextMessage = "Here are some relevant previous conversations:\n" +
        relevantMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n') +
        "\n---\n";

      messages.unshift({ role: "system", content: contextMessage });
    }

    // Debug: log tool schemas to verify they are valid JSON Schema
    try {
      const toolKeys = Object.keys(tools);
      console.log("Available tools:", toolKeys);
      
      // Check first tool's schema structure
      if (toolKeys.length > 0) {
        const firstTool = (tools as Record<string, unknown>)[toolKeys[0]];
        const toolObj = firstTool as { parameters?: { type?: string } };
        console.log("First tool schema validation:", {
          hasParameters: !!toolObj.parameters,
          parametersType: toolObj.parameters?.type,
          isValidSchema: toolObj.parameters?.type === "object"
        });
      }
    } catch (toolError: unknown) {
      console.error("Tool schema validation error:", toolError);
    }

    // Generate AI response WITHOUT tools first to test basic OpenAI integration
    console.log("Calling OpenAI without tools...");
    let finalResponse: string;
    try {
      const result = await generateText({
        model: openai.chat(openaiModel),
        system: systemPrompt,
        messages,
        maxOutputTokens: 2000,
      });
      finalResponse = result.text;
      console.log("OpenAI call successful");
    } catch (openaiError: unknown) {
      console.error("OpenAI call failed:", openaiError);
      const errorMessage = openaiError instanceof Error ? openaiError.message : "Unknown error";
      finalResponse = `Sorry, I encountered an error processing your request. Error: ${errorMessage}`;
    }

    // Store the user message and AI response with tenant context (with error handling)
    try {
      console.log("Storing user message...");
      const userEmbedding = await generateEmbedding(userPrompt as string);
      const userMessageResult = await (insertMessage as unknown as (client: SupabaseClient, data: MessageData) => Promise<{ result: unknown; error: string | null }>)(serviceRoleClient, {
        user_id: userId as string,
        role: incomingMessageRole as string,
        content: userPrompt as string,
        chat_id: chatId,
        tenant_id: tenantId as string,
        embedding: userEmbedding
      });
      
      if (userMessageResult.error) {
        console.error("User message insertion failed:", userMessageResult.error);
      } else {
        console.log("User message stored successfully");
      }
      
      console.log("Storing assistant message...");
      const assistantEmbedding = await generateEmbedding(finalResponse);
      const assistantMessageResult = await (insertMessage as unknown as (client: SupabaseClient, data: MessageData) => Promise<{ result: unknown; error: string | null }>)(serviceRoleClient, {
        user_id: userId as string,
        role: "assistant",
        content: finalResponse,
        chat_id: chatId,
        tenant_id: tenantId as string,
        embedding: assistantEmbedding
      });
      
      if (assistantMessageResult.error) {
        console.error("Assistant message insertion failed:", assistantMessageResult.error);
      } else {
        console.log("Assistant message stored successfully");
      }
      
      console.log("Message storage complete");
    } catch (storageError: unknown) {
      console.error("Message storage failed:", storageError);
      // Continue execution even if storage fails
    }

    // Call telegram-outgoing to send the response
    if (callbackUrl) {
      const outgoingPayload = {
        finalResponse,
        id,
        userId,
        metadata: { ...metadata, userId, tenantId },
      };

      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outgoingPayload),
      });
    }

    return new Response(JSON.stringify({
      status: "ai_processing_complete_for_id"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Processing error:", error);

    // Send error message to Telegram
    if (callbackUrl && raw && typeof raw === 'object' && raw !== null) {
      try {
        const rawObj = raw as { id?: string | number; userId?: string; metadata?: Record<string, unknown>; tenantId?: string };
        const errorResponse = "Sorry, an internal error occurred.";
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finalResponse: errorResponse,
            id: rawObj.id,
            userId: rawObj.userId,
            metadata: { ...rawObj.metadata, userId: rawObj.userId, tenantId: rawObj.tenantId },
          }),
        });
      } catch (_) {
        // Silent failure
      }
    }
    return new Response("Internal Server Error", { status: 500 });
  }
});
