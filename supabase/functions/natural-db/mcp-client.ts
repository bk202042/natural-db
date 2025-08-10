// MCP Client for Zapier Integration
// This module handles MCP (Model Context Protocol) client setup and management
// for integrating with Zapier's email and calendar services

import { z } from "npm:zod@3.25.76";

// MCP Client Types
interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPClient {
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, arguments: Record<string, unknown>): Promise<MCPToolResult>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}

interface MCPToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

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

// Production MCP Client Implementation
class ZapierMCPClient implements MCPClient {
  private connected = false;
  private readonly baseUrl: string;
  private readonly authToken: string;
  private availableTools: MCPTool[] = [];

  constructor(url: string, authToken: string) {
    this.baseUrl = url;
    this.authToken = authToken;
  }

  async connect(): Promise<void> {
    try {
      // Initialize MCP connection
      const response = await fetch(`${this.baseUrl}/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          }
        })
      });

      if (!response.ok) {
        throw new Error(`MCP initialization failed: ${response.status}`);
      }

      this.connected = true;
      await this.discoverTools();
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/list`, {
        method: 'POST',
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Tool discovery failed: ${response.status}`);
      }

      const data = await response.json();
      this.availableTools = data.tools || [];
    } catch (error) {
      // Fallback to common Zapier tools
      this.availableTools = [
        {
          name: "send_email",
          description: "Send an email via Zapier integration",
          inputSchema: {
            type: "object",
            properties: {
              to: { type: "string", format: "email" },
              subject: { type: "string" },
              body: { type: "string" },
              html: { type: "string" }
            },
            required: ["to", "subject"]
          }
        },
        {
          name: "create_calendar_event",
          description: "Create a calendar event via Zapier integration",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              start_time: { type: "string" },
              end_time: { type: "string" },
              description: { type: "string" },
              recurrence: { type: "string" },
              calendar_id: { type: "string" }
            },
            required: ["title", "start_time"]
          }
        },
        {
          name: "delete_calendar_event",
          description: "Delete a calendar event via Zapier integration",
          inputSchema: {
            type: "object",
            properties: {
              event_id: { type: "string" }
            },
            required: ["event_id"]
          }
        }
      ];
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }
    return this.availableTools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }

    try {
      const response = await fetch(`${this.baseUrl}/tools/call`, {
        method: 'POST',
        headers: {
          'Authorization': this.authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          arguments: args
        })
      });

      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.status}`);
      }

      const result = await response.json();
      return result as MCPToolResult;
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error calling ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.availableTools = [];
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

  async initialize(): Promise<boolean> {
    // Use the Zapier MCP URL and auth token you provided
    const zapierMcpUrl = Deno.env.get("ZAPIER_MCP_URL") || "https://mcp.zapier.com/api/mcp/mcp";
    const zapierAuthToken = Deno.env.get("ZAPIER_MCP_AUTH_TOKEN") || "Bearer MTY3MWQxM2UtMWZlOS00ZWI5LTkxYWUtMjYwZWZiNWFjZWViOjEzZmFiY2EzLWYzM2UtNDJjZC1iMDRhLTliN2ZhNGEwOTA1Yw==";

    if (!zapierMcpUrl) {
      return false;
    }

    try {
      this.client = new ZapierMCPClient(zapierMcpUrl, zapierAuthToken);
      await this.client.connect();
      return true;
    } catch (error) {
      this.client = null;
      return false;
    }
  }

  getClient(): ZapierMCPClient | null {
    return this.client;
  }

  isAvailable(): boolean {
    return this.client !== null && this.client.isConnected();
  }

  async sendEmail(to: string, subject: string, body?: string, html?: string): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable()) {
      return { success: false, message: "MCP client not available" };
    }

    try {
      const result = await this.client!.callTool("send_email", { to, subject, body, html });
      
      if (result.isError) {
        return { success: false, message: result.content[0]?.text || "Unknown error" };
      }

      return { success: true, message: result.content[0]?.text || "Email sent" };
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
  ): Promise<{ success: boolean; message: string; eventId?: string }> {
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

      const result = await this.client!.callTool("create_calendar_event", args);
      
      if (result.isError) {
        return { success: false, message: result.content[0]?.text || "Unknown error" };
      }

      try {
        const responseData = JSON.parse(result.content[0]?.text || "{}");
        return { 
          success: true, 
          message: responseData.message || "Calendar event created",
          eventId: responseData.event_id
        };
      } catch {
        return { success: true, message: result.content[0]?.text || "Calendar event created" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }

  async deleteCalendarEvent(eventId: string): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable()) {
      return { success: false, message: "MCP client not available" };
    }

    try {
      const result = await this.client!.callTool("delete_calendar_event", { event_id: eventId });
      
      if (result.isError) {
        return { success: false, message: result.content[0]?.text || "Unknown error" };
      }

      return { success: true, message: result.content[0]?.text || "Calendar event deleted" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

// Export singleton instance
export const mcpClient = MCPClientManager.getInstance();