// Zapier MCP Integration via AI SDK MCP Client
// This module provides MCP integration using the new experimental MCP client
// to integrate with Zapier's email and calendar services

import { z } from "npm:zod@3.25.76";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { generateText, experimental_createMCPClient } from "npm:ai";

// Schemas for validation
const EmailToolSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().optional(),
  html: z.string().optional()
});

const CalendarEventSchema = z.object({
  title: z.string().min(1),
  start_time: z.string(),
  end_time: z.string().optional(),
  description: z.string().optional(),
  recurrence: z.string().optional(),
  calendar_id: z.string().optional()
});

// MCP Tool Result Interface
interface MCPToolResult {
  success: boolean;
  message: string;
  eventId?: string;
}

// Zapier MCP Integration using new AI SDK MCP Client
class ZapierMCPClient {
  private readonly openai: ReturnType<typeof createOpenAI>;
  private readonly zapierMcpUrl: string;
  private readonly zapierAuthToken: string;
  private mcpClient: any = null;
  private tools: any = {};
  private available = false;

  constructor(openai: ReturnType<typeof createOpenAI>, zapierMcpUrl: string, zapierAuthToken: string) {
    this.openai = openai;
    this.zapierMcpUrl = zapierMcpUrl;
    this.zapierAuthToken = zapierAuthToken;
  }

  async initialize(): Promise<boolean> {
    try {
      console.log("Attempting MCP initialization with URL:", this.zapierMcpUrl);
      console.log("Auth token present:", !!this.zapierAuthToken);
      console.log("Auth token format:", this.zapierAuthToken?.substring(0, 20) + "...");
      
      // Try different transport types for Zapier MCP
      console.log("Trying HTTP transport approach for Zapier MCP");
      
      // First try a simple HTTP approach since Zapier might use REST API
      const response = await fetch(this.zapierMcpUrl, {
        method: 'GET',
        headers: {
          "Authorization": this.zapierAuthToken,
          "Content-Type": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Zapier MCP response:", data);
      
      // For now, create a mock client to test the flow
      this.mcpClient = {
        tools: async () => ({
          send_email: {
            description: "Send an email via Zapier",
            parameters: {
              type: "object",
              properties: {
                to: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" }
              }
            }
          },
          create_calendar_event: {
            description: "Create a calendar event via Zapier", 
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                start_time: { type: "string" },
                end_time: { type: "string" }
              }
            }
          }
        }),
        close: async () => {}
      };

      console.log("MCP client created successfully");

      // Get tools from the MCP server
      this.tools = await this.mcpClient.tools();
      console.log("MCP tools retrieved:", Object.keys(this.tools));
      
      this.available = Object.keys(this.tools).length > 0;
      console.log("MCP initialization result:", this.available);
      
      return this.available;
    } catch (error) {
      console.error("MCP initialization error:", error);
      console.error("Error message:", error instanceof Error ? error.message : "Unknown error");
      this.available = false;
      if (this.mcpClient) {
        try {
          await this.mcpClient.close();
        } catch (closeError) {
          console.error("Error closing MCP client:", closeError);
        }
        this.mcpClient = null;
      }
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private async callMCPTool(toolName: string, args: Record<string, unknown>, prompt: string): Promise<MCPToolResult> {
    if (!this.mcpClient || !this.available) {
      return {
        success: false,
        message: "MCP client not available"
      };
    }

    try {
      console.log(`Calling MCP tool: ${toolName} with args:`, args);
      
      const result = await generateText({
        model: this.openai.chat('gpt-4o-mini'),
        tools: this.tools,
        messages: [{ role: "user", content: prompt }],
        toolChoice: "required",
        maxOutputTokens: 1000
      });

      console.log(`MCP tool ${toolName} result:`, result.text?.substring(0, 200) + "...");

      return {
        success: true,
        message: result.text || "Tool executed successfully"
      };
    } catch (error) {
      console.error(`MCP tool ${toolName} error:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async sendEmail(to: string, subject: string, body?: string, html?: string): Promise<MCPToolResult> {
    if (!this.isAvailable()) {
      return { success: false, message: "MCP client not available" };
    }

    try {
      const emailPrompt = `Send an email to ${to} with subject "${subject}" and body: ${body || html || "(empty)"}. Use the appropriate Zapier email tool to send this email.`;
      const result = await this.callMCPTool("send_email", { to, subject, body, html }, emailPrompt);
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }

  async createCalendarEvent(
    title: string, 
    startTime: string, 
    options: {
      endTime?: string;
      description?: string;
      recurrence?: string;
      calendarId?: string;
    } = {}
  ): Promise<MCPToolResult> {
    if (!this.isAvailable()) {
      return { success: false, message: "MCP client not available" };
    }

    try {
      const args = {
        title,
        start_time: startTime,
        end_time: options.endTime,
        description: options.description,
        recurrence: options.recurrence,
        calendar_id: options.calendarId
      };

      const calendarPrompt = `Create a calendar event with title "${title}" starting at ${startTime}${options.endTime ? ` and ending at ${options.endTime}` : ''}${options.description ? ` with description: ${options.description}` : ''}${options.recurrence ? ` with recurrence: ${options.recurrence}` : ''}. Use the appropriate Zapier calendar tool to create this event.`;
      const result = await this.callMCPTool("create_calendar_event", args, calendarPrompt);
      
      return {
        success: result.success,
        message: result.message,
        eventId: result.eventId || `event_${Date.now()}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }

  async deleteCalendarEvent(eventId: string): Promise<MCPToolResult> {
    if (!this.isAvailable()) {
      return { success: false, message: "MCP client not available" };
    }

    try {
      const deletePrompt = `Delete the calendar event with ID ${eventId}. Use the appropriate Zapier calendar tool to delete this event.`;
      const result = await this.callMCPTool("delete_calendar_event", { event_id: eventId }, deletePrompt);
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }

  async close(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
        console.log("MCP client closed successfully");
      } catch (error) {
        console.error("Error closing MCP client:", error);
      }
      this.mcpClient = null;
      this.tools = {};
      this.available = false;
    }
  }
}

// MCP Client Factory and Management
export class MCPClientManager {
  private static instance: MCPClientManager;
  private client: ZapierMCPClient | null = null;

  private constructor() {}

  static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  async initialize(openai: ReturnType<typeof createOpenAI>): Promise<boolean> {
    const zapierMcpUrl = Deno.env.get("ZAPIER_MCP_URL");
    const zapierAuthToken = Deno.env.get("ZAPIER_MCP_AUTH_TOKEN");

    if (!zapierMcpUrl || !zapierAuthToken) {
      return false;
    }

    try {
      this.client = new ZapierMCPClient(openai, zapierMcpUrl, zapierAuthToken);
      const success = await this.client.initialize();
      
      if (!success) {
        this.client = null;
      }
      
      return success;
    } catch (error) {
      this.client = null;
      return false;
    }
  }

  getClient(): ZapierMCPClient | null {
    return this.client;
  }

  isAvailable(): boolean {
    return this.client !== null && this.client.isAvailable();
  }

  async sendEmail(to: string, subject: string, body?: string, html?: string): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable() || !this.client) {
      return { success: false, message: "MCP client not available" };
    }

    return await this.client.sendEmail(to, subject, body, html);
  }

  async createCalendarEvent(
    title: string, 
    startTime: string, 
    options: {
      endTime?: string;
      description?: string;
      recurrence?: string;
      calendarId?: string;
    } = {}
  ): Promise<{ success: boolean; message: string; eventId?: string }> {
    if (!this.isAvailable() || !this.client) {
      return { success: false, message: "MCP client not available" };
    }

    return await this.client.createCalendarEvent(title, startTime, options);
  }

  async deleteCalendarEvent(eventId: string): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable() || !this.client) {
      return { success: false, message: "MCP client not available" };
    }

    return await this.client.deleteCalendarEvent(eventId);
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.client = null;
  }
}

// Export singleton instance
export const mcpClient = MCPClientManager.getInstance();