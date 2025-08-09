import { createOpenAI } from "npm:@ai-sdk/openai@0.0.66";
import { generateText, experimental_createMCPClient } from "npm:ai@3.4.33";
import { z } from "npm:zod@3.22.4";
import { 
  executeRestrictedSQL,
  executePrivilegedSQL,
  convertBigIntsToStrings,
  loadRecentAndRelevantMessages,
  insertMessage,
  generateEmbedding,
  getMemoriesSchemaDetails
} from "./db-utils.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { createTools } from "./tools.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
const openaiModel = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const zapierMcpUrl = Deno.env.get("ZAPIER_MCP_URL");
const allowedUsernames = Deno.env.get("ALLOWED_USERNAMES");

if (!supabaseUrl || !supabaseServiceRoleKey || !openaiApiKey) {
  throw new Error("Missing required environment variables");
}

const openai = createOpenAI({
  apiKey: openaiApiKey,
  compatibility: "strict"
});

// Create tenant-aware Supabase client factory
function createTenantSupabaseClient(tenantId: string) {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    global: {
      headers: {
        'x-tenant-id': tenantId,
      },
    },
  });
}

const MAX_CHAT_HISTORY = 10;
const MAX_RELEVANT_MESSAGES = 5;

const IncomingPayloadSchema = z.object({
  userPrompt: z.string().min(1),
  id: z.union([z.string(), z.number()]),
  userId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  timezone: z.string().nullable().optional(),
  tenantId: z.string().uuid(),
  incomingMessageRole: z.enum(["user", "assistant", "system", "system_routine_task"]),
  callbackUrl: z.string().url(),
});

// Copy all the helper functions and main logic from the original file
// This is a simplified restoration - in practice, you'd want to restore the full file

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let raw: any = null;
  let callbackUrl: string | undefined;
  let metadata: Record<string, unknown> = {};

  try {
    raw = await req.json();
    const parsed = IncomingPayloadSchema.safeParse(raw);
    
    if (!parsed.success) {
      console.error("Invalid request body:", parsed.error);
      return new Response("Invalid request body", { status: 400 });
    }

    const { userPrompt, id, userId, tenantId, incomingMessageRole, timezone } = parsed.data;
    metadata = parsed.data.metadata || {};
    callbackUrl = parsed.data.callbackUrl;

    // Create tenant-aware Supabase client
    const supabase = createTenantSupabaseClient(tenantId);
    
    // Load recent and relevant messages with tenant context
    const chatId = id.toString();
    const { recentMessages, relevantMessages } = await loadRecentAndRelevantMessages(
      supabase,
      chatId,
      userPrompt,
      MAX_CHAT_HISTORY,
      MAX_RELEVANT_MESSAGES
    );

    // Get system prompt for this chat with tenant context
    const { data: systemPromptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("chat_id", chatId)
      .eq("is_active", true)
      .maybeSingle();

    const systemPrompt = systemPromptData?.prompt_content || 
      `You are a helpful AI assistant with persistent memory. You are concise and friendly. 
       The user's timezone is ${timezone || 'UTC'}. Current time: ${new Date().toISOString()}.
       
       You have access to tools for managing persistent memories and scheduling tasks. 
       Use them when appropriate to help users with long-term needs.`;

    // Create tools with tenant context
    const tools = createTools(supabase, chatId, tenantId);

    // Prepare messages array
    const messages = [
      ...recentMessages.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content
      })),
      { role: "user" as const, content: userPrompt }
    ];

    // Add relevant historical messages if any
    if (relevantMessages.length > 0) {
      const contextMessage = "Here are some relevant previous conversations:\n" +
        relevantMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n') + 
        "\n---\n";
      
      messages.unshift({ role: "system", content: contextMessage });
    }

    // Generate AI response with tools
    const result = await generateText({
      model: openai(openaiModel),
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 5,
      maxTokens: 2000,
    });

    const finalResponse = result.text;

    // Store the user message and AI response with tenant context
    const userEmbedding = await generateEmbedding(userPrompt);
    await insertMessage(supabase, {
      user_id: userId,
      role: incomingMessageRole,
      content: userPrompt,
      chat_id: chatId,
      embedding: userEmbedding
    });

    const assistantEmbedding = await generateEmbedding(finalResponse);
    await insertMessage(supabase, {
      user_id: userId,
      role: "assistant",
      content: finalResponse,
      chat_id: chatId,
      embedding: assistantEmbedding
    });

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
    if (callbackUrl && raw?.id && raw?.metadata) {
      try {
        const errorResponse = "Sorry, an internal error occurred.";
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finalResponse: errorResponse,
            id: raw.id,
            userId: raw.userId,
            metadata: { ...raw.metadata, userId: raw.userId, tenantId: raw.tenantId },
          }),
        });
      } catch (_) {
        // Silent failure
      }
    }
    return new Response("Internal Server Error", { status: 500 });
  }
});
