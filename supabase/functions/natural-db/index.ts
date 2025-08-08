import { z } from "npm:zod@3.22.4";

const IncomingPayloadSchema = z.object({
  userPrompt: z.string().min(1),
  id: z.union([z.string(), z.number()]),
  userId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  timezone: z.string().nullable().optional(),
  incomingMessageRole: z.enum(["user", "assistant", "system", "system_routine_task"]),
  callbackUrl: z.string().url(),
});

Deno.serve(async (req) => {
  try {
    console.log("DEBUG: Function started");
    
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    console.log("DEBUG: Method check passed");
    
    const raw = await req.json();
    console.log("DEBUG: JSON parsed:", Object.keys(raw || {}));
    
    return new Response(JSON.stringify({ 
      status: "debug_success",
      received_keys: Object.keys(raw || {})
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("DEBUG: Caught error:", error);
    return new Response("Debug error: " + String(error), { status: 500 });
  }
});
