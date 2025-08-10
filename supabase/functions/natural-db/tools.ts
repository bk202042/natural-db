import { tool } from "npm:ai";
import {
  executeRestrictedSQL,
  executePrivilegedSQL,
  convertBigIntsToStrings,
} from "./db-utils.ts";

// Local validation helpers
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_REGEX.test(name);
}

const JOB_NAME_REGEX = /^[a-zA-Z0-9_]+$/;
function isValidJobName(name: string): boolean {
  return JOB_NAME_REGEX.test(name);
}

// Scheduling helper functions
async function scheduleCron(jobName: string, cronExpression: string, payload: Record<string, unknown>, supabaseUrl: string): Promise<{ error?: string }> {
  if (!isValidJobName(jobName)) {
    return { error: "Invalid job name format" };
  }

  const escapedPayload = JSON.stringify(payload).replace(/'/g, "''");
  const scheduleSQL = `SELECT cron.schedule('${jobName}', '${cronExpression}', $$ SELECT net.http_post(url := '${supabaseUrl}/functions/v1/natural-db', body := '${escapedPayload}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) $$);`;

  const result = await executePrivilegedSQL(scheduleSQL);
  if (result.error) {
    return { error: `Failed to schedule job: ${result.error}` };
  }

  return {};
}

async function unscheduleCron(jobName: string): Promise<{ error?: string }> {
  if (!isValidJobName(jobName)) {
    return { error: "Invalid job name format" };
  }

  const unscheduleSQL = `SELECT cron.unschedule('${jobName}');`;
  const result = await executePrivilegedSQL(unscheduleSQL);

  if (result.error) {
    return { error: `Failed to unschedule job: ${result.error}` };
  }

  return {};
}

// Email settings helper function
async function getChatEmailSettings(tenantId: string, chatId: string): Promise<{ email?: string; email_enabled?: boolean; error?: string }> {
  const result = await executeRestrictedSQL(
    `SELECT email, email_enabled FROM notification_settings WHERE tenant_id = $1 AND chat_id = $2`,
    [tenantId, chatId],
    tenantId
  );

  if (result.error) {
    return { error: `Failed to fetch email settings: ${result.error}` };
  }

  if ((result.result ?? []).length > 0) {
    const settings = (result.result?.[0] as { email?: string; email_enabled?: boolean });
    return { email: settings.email, email_enabled: settings.email_enabled };
  }

  return { error: "No email settings found" };
}

// Create tenant-aware tools for the real estate CS bot
export function createTools(
  _supabase: unknown,
  chatId: string,
  tenantId: string
) {
  // Get Supabase URL from environment for cron callbacks
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  return {
    execute_sql: tool({
      description:
        `Executes SQL within your private memories schema. Create tables directly (e.g., CREATE TABLE my_notes). You have full control over this isolated database space with tenant isolation.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SQL query (DML/DDL)."
          }
        },
        required: ["query"]
      },
      execute: async ({ query }: { query: string }) => {
        const result = await executeRestrictedSQL(query, [], tenantId);
        if (result.error) return { error: result.error };

        const trimmed = query.trim();
        const rows = (result.result ?? []) as unknown[];
        const rowsConverted = convertBigIntsToStrings(rows);
        if (trimmed.toUpperCase().startsWith("SELECT") || rowsConverted.length > 0) {
          return JSON.stringify(rowsConverted);
        }
        return JSON.stringify({
          message: "Command executed successfully.",
          rowCount: Number((result.result ?? []).length || 0),
        });
      },
    }),

    get_distinct_column_values: tool({
      description:
        `Retrieves distinct values for a column within your private memories schema.`,
      parameters: {
        type: "object",
        properties: {
          table_name: {
            type: "string",
            description: "Table name."
          },
          column_name: {
            type: "string",
            description: "Column name."
          }
        },
        required: ["table_name", "column_name"]
      },
      execute: async ({ table_name, column_name }: { table_name: string; column_name: string }) => {
        if (!isValidIdentifier(table_name) || !isValidIdentifier(column_name)) {
          return { error: "Invalid table or column name format." };
        }
        const query = `SELECT DISTINCT "${column_name}" FROM ${table_name};`;
        const result = await executeRestrictedSQL(query, [], tenantId);
        if (result.error) return { error: result.error };
        const rows = (result.result ?? []) as Array<Record<string, unknown>>;
        const values = rows.map((row) => row[column_name]);
        return { distinct_values: convertBigIntsToStrings(values) };
      },
    }),

    // ========================================================================
    // REAL ESTATE DOMAIN TOOLS (Tenant-Aware)
    // ========================================================================

    fees_create: tool({
      description: "Creates a recurring fee reminder with optional amount and note. Schedules monthly reminders and optionally sends email confirmation.",
      parameters: {
        type: "object",
        properties: {
          fee_type: {
            type: "string",
            enum: ["electricity", "management", "water", "other"],
            description: "Type of fee"
          },
          due_day: {
            type: "integer",
            minimum: 1,
            maximum: 31,
            description: "Day of month when fee is due (1-31)"
          },
          amount: {
            type: "number",
            minimum: 0,
            description: "Optional fee amount"
          },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            description: "Currency code (e.g. USD, EUR)"
          },
          note: {
            type: "string",
            description: "Optional note or description"
          }
        },
        required: ["fee_type", "due_day"]
      },
      execute: async ({ fee_type, due_day, amount, currency = 'USD', note }: { fee_type: 'electricity'|'management'|'water'|'other'; due_day: number; amount?: number; currency?: string; note?: string }) => {
        try {
          // Insert fee record with tenant context
          const insertFeeResult = await executeRestrictedSQL(
            `INSERT INTO fees (tenant_id, chat_id, fee_type, due_day, amount, currency, note, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING id, fee_type, due_day, amount, currency, note`,
            [tenantId, chatId, fee_type, due_day, amount, currency, note],
            tenantId
          );

          if (insertFeeResult.error) {
            return { error: `Failed to create fee: ${insertFeeResult.error}` };
          }

          const fee = ((insertFeeResult.result ?? [])[0] as { id: string });
          const feeId = fee.id;

          // Schedule monthly cron job at 9:00 AM on due day
          const cronExpression = `0 9 ${due_day} * *`;
          const jobName = `fee_${chatId}_${feeId}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);

          const cronPayload = {
            userPrompt: `Send a fee reminder for fee_id=${feeId} and chat_id=${chatId}`,
            id: chatId,
            userId: 'system',
            metadata: { feeId, chatId, originalUserMessage: 'scheduled_fee_reminder' },
            tenantId: tenantId,
            incomingMessageRole: 'system_routine_task',
            callbackUrl: `${supabaseUrl}/functions/v1/telegram-outgoing`
          };

          const scheduleResult = await scheduleCron(jobName, cronExpression, cronPayload, supabaseUrl);
          if (scheduleResult.error) {
            return { error: `Fee created but scheduling failed: ${scheduleResult.error}` };
          }

          // Store job metadata
          await executeRestrictedSQL(
            `INSERT INTO fee_jobs (tenant_id, fee_id, cron_job_name, cron_expression) VALUES ($1, $2, $3, $4)`,
            [tenantId, feeId, jobName, cronExpression],
            tenantId
          );

          let confirmationMessage = `✅ ${fee_type} fee reminder created for day ${due_day} of each month`;
          if (amount) {
            confirmationMessage += ` (${currency} ${amount})`;
          }
          if (note) {
            confirmationMessage += ` - ${note}`;
          }

          return confirmationMessage;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to create fee reminder: ${err.message}` };
        }
      }
    }),

    fees_list_active: tool({
      description: "Lists all active fee reminders for the current chat.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      },
      execute: async () => {
        try {
          const result = await executeRestrictedSQL(
            `SELECT id, fee_type, due_day, amount, currency, note, created_at
             FROM fees
             WHERE tenant_id = $1 AND chat_id = $2 AND is_active = true
             ORDER BY due_day, fee_type`,
            [tenantId, chatId],
            tenantId
          );

          if (result.error) {
            return { error: `Failed to list fees: ${result.error}` };
          }

          if ((result.result ?? []).length === 0) {
            return "No active fee reminders found.";
          }

          const rows = (result.result ?? []) as Array<{ fee_type: string; due_day: number; amount?: number | null; currency?: string; note?: string | null }>;
          const feesList = rows.map(fee => {
            let feeDesc = `• ${fee.fee_type} (day ${fee.due_day})`;
            if (fee.amount) {
              feeDesc += ` - ${fee.currency} ${fee.amount}`;
            }
            if (fee.note) {
              feeDesc += ` (${fee.note})`;
            }
            return feeDesc;
          }).join('\n');

          return `Active fee reminders:\n${feesList}`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to list active fees: ${err.message}` };
        }
      }
    }),

    fees_cancel: tool({
      description: "Cancels an active fee reminder by fee type and due day.",
      parameters: {
        type: "object",
        properties: {
          fee_type: {
            type: "string",
            enum: ["electricity", "management", "water", "other"],
            description: "Type of fee to cancel"
          },
          due_day: {
            type: "integer",
            minimum: 1,
            maximum: 31,
            description: "Due day to help identify the specific fee"
          }
        },
        required: ["fee_type", "due_day"]
      },
      execute: async ({ fee_type, due_day }: { fee_type: 'electricity'|'management'|'water'|'other'; due_day: number }) => {
        try {
          // Find the fee to cancel
          const feeResult = await executeRestrictedSQL(
            `SELECT id, fee_type, due_day FROM fees
             WHERE tenant_id = $1 AND chat_id = $2 AND fee_type = $3 AND due_day = $4 AND is_active = true`,
            [tenantId, chatId, fee_type, due_day],
            tenantId
          );

          if (feeResult.error) {
            return { error: `Failed to find fee: ${feeResult.error}` };
          }

          if ((feeResult.result ?? []).length === 0) {
            return `No active ${fee_type} fee found for day ${due_day}.`;
          }

          const fee = ((feeResult.result ?? [])[0] as { id: string });
          const feeId = fee.id;

          // Mark fee as inactive
          const deactivateResult = await executeRestrictedSQL(
            `UPDATE fees SET is_active = false, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [feeId, tenantId],
            tenantId
          );

          if (deactivateResult.error) {
            return { error: `Failed to cancel fee: ${deactivateResult.error}` };
          }

          // Find and unschedule the cron job
          const jobResult = await executeRestrictedSQL(
            `SELECT cron_job_name FROM fee_jobs WHERE tenant_id = $1 AND fee_id = $2`,
            [tenantId, feeId],
            tenantId
          );

          if ((jobResult.result ?? []).length > 0) {
            const jobName = (jobResult.result?.[0] as { cron_job_name: string }).cron_job_name;
            const unscheduleResult = await unscheduleCron(jobName);

            if (unscheduleResult.error) {
              return { error: `Fee cancelled but failed to unschedule job: ${unscheduleResult.error}` };
            }
          }

          return `✅ ${fee_type} fee reminder for day ${due_day} has been cancelled.`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to cancel fee: ${err.message}` };
        }
      }
    }),

    docs_store: tool({
      description: "Stores a document (text or URL) for later parsing and retrieval.",
      parameters: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            enum: ["contract", "invoice", "other"],
            description: "Type of document"
          },
          source_kind: {
            type: "string",
            enum: ["text", "url"],
            description: "Whether this is raw text or a URL"
          },
          source_value: {
            type: "string",
            minLength: 1,
            description: "The actual text content or URL"
          }
        },
        required: ["doc_type", "source_kind", "source_value"]
      },
      execute: async ({ doc_type, source_kind, source_value }: { doc_type: 'contract'|'invoice'|'other'; source_kind: 'text'|'url'; source_value: string }) => {
        try {
          const result = await executeRestrictedSQL(
            `INSERT INTO documents (tenant_id, chat_id, doc_type, source_kind, source_value)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, doc_type, source_kind`,
            [tenantId, chatId, doc_type, source_kind, source_value],
            tenantId
          );

          if (result.error) {
            return { error: `Failed to store document: ${result.error}` };
          }

          const doc = ((result.result ?? [])[0] as { id: string });
          return {
            message: `✅ ${doc_type} document stored successfully`,
            document_id: doc.id
          };

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to store document: ${err.message}` };
        }
      }
    }),

    docs_parse: tool({
      description: "Parses a stored document using AI to extract structured information.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            description: "ID of the document to parse"
          }
        },
        required: ["document_id"]
      },
      execute: async ({ document_id }: { document_id: string }) => {
        try {
          // Get the document
          const docResult = await executeRestrictedSQL(
            `SELECT id, doc_type, source_kind, source_value FROM documents
             WHERE id = $1 AND tenant_id = $2 AND chat_id = $3`,
            [document_id, tenantId, chatId],
            tenantId
          );

          if (docResult.error) {
            return { error: `Failed to retrieve document: ${docResult.error}` };
          }

          if ((docResult.result ?? []).length === 0) {
            return { error: "Document not found" };
          }

          const doc = ((docResult.result ?? [])[0] as { source_value: string; id: string; doc_type: string; source_kind: string });
          const textContent = doc.source_value;

          // Simple parsing for now - extract basic info
          const parsed = {
            document_type: doc.doc_type,
            summary: `This is a ${doc.doc_type} document`,
            extracted_at: new Date().toISOString(),
            content_preview: textContent.substring(0, 200) + (textContent.length > 200 ? '...' : ''),
            // TODO: Add OpenAI parsing for structured data extraction
            fields: {
              content_length: textContent.length,
              source_type: doc.source_kind
            }
          };

          // Update the document with parsed data
          const updateResult = await executeRestrictedSQL(
            `UPDATE documents SET parsed = $1 WHERE id = $2 AND tenant_id = $3`,
            [JSON.stringify(parsed), document_id, tenantId],
            tenantId
          );

          if (updateResult.error) {
            return { error: `Failed to update parsed data: ${updateResult.error}` };
          }

          return `✅ Document parsed successfully. Summary: ${parsed.summary}`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to parse document: ${err.message}` };
        }
      }
    }),

    docs_email_summary: tool({
      description: "Emails a summary of a parsed document (placeholder for MCP integration).",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            description: "ID of the document to summarize"
          },
          to: {
            type: "string",
            format: "email",
            description: "Email address (optional, uses chat settings if not provided)"
          }
        },
        required: ["document_id"]
      },
      execute: async ({ document_id, to }: { document_id: string; to?: string }) => {
        try {
          // Get document and its parsed data
          const docResult = await executeRestrictedSQL(
            `SELECT id, doc_type, source_kind, source_value, parsed FROM documents
             WHERE id = $1 AND tenant_id = $2 AND chat_id = $3`,
            [document_id, tenantId, chatId],
            tenantId
          );

          if (docResult.error || (docResult.result ?? []).length === 0) {
            return { error: "Document not found" };
          }

          const doc = ((docResult.result ?? [])[0] as { doc_type: string });

          // Get email address if not provided
          let emailAddress = to as string | undefined;
          if (!emailAddress) {
            const emailSettings = await getChatEmailSettings(tenantId, chatId);
            if (emailSettings.error) {
              return { error: "No email address provided and no notification settings found" };
            }
            emailAddress = emailSettings.email;
          }

          const subject = `Document Summary: ${doc.doc_type}`;
          // TODO: Implement actual email sending via MCP when available
          return `✅ Document summary prepared for ${emailAddress}. Subject: ${subject}. (MCP email integration needed)`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to email document summary: ${err.message}` };
        }
      }
    }),

    notifications_set_email_prefs: tool({
      description: "Sets email notification preferences for the current chat.",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Email address for notifications"
          },
          email_enabled: {
            type: "boolean",
            description: "Whether to enable email notifications"
          },
          calendar_provider: {
            type: "string",
            enum: ["google", "outlook"],
            description: "Preferred calendar provider"
          },
          default_reminder_minutes: {
            type: "integer",
            minimum: 1,
            description: "Default reminder time before due date in minutes"
          }
        },
        required: ["email"]
      },
      execute: async ({ email, email_enabled, calendar_provider, default_reminder_minutes }: { email: string; email_enabled?: boolean; calendar_provider?: 'google'|'outlook'; default_reminder_minutes?: number }) => {
        try {
          const result = await executeRestrictedSQL(
            `INSERT INTO notification_settings (tenant_id, chat_id, email, email_enabled, calendar_provider, default_reminder_minutes, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (tenant_id, chat_id)
             DO UPDATE SET
               email = EXCLUDED.email,
               email_enabled = EXCLUDED.email_enabled,
               calendar_provider = EXCLUDED.calendar_provider,
               default_reminder_minutes = EXCLUDED.default_reminder_minutes,
               updated_at = NOW()
             RETURNING email, email_enabled, calendar_provider, default_reminder_minutes`,
            [tenantId, chatId, email, email_enabled, calendar_provider, default_reminder_minutes],
            tenantId
          );

          if (result.error) {
            return { error: `Failed to update notification settings: ${result.error}` };
          }

          const settings = ((result.result ?? [])[0] as { email: string; email_enabled: boolean; calendar_provider: string; default_reminder_minutes: number });
          return `✅ Email preferences updated: ${settings.email} (${settings.email_enabled ? 'enabled' : 'disabled'}), ${settings.calendar_provider} calendar, ${settings.default_reminder_minutes}min reminders`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to set email preferences: ${err.message}` };
        }
      }
    }),

    notifications_send_email: tool({
      description: "Sends an email notification (placeholder for MCP integration).",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            format: "email",
            description: "Recipient email (uses chat settings if not provided)"
          },
          subject: {
            type: "string",
            description: "Email subject"
          },
          html: {
            type: "string",
            description: "HTML email body"
          },
          text: {
            type: "string",
            description: "Plain text email body"
          }
        },
        required: ["subject"]
      },
      execute: async ({ to, subject, html: _html, text: _text }: { to?: string; subject: string; html?: string; text?: string }) => {
        try {
          // Get email address if not provided
          let emailAddress = to as string | undefined;
          if (!emailAddress) {
            const emailSettings = await getChatEmailSettings(tenantId, chatId);
            if (emailSettings.error) {
              return { error: "No email address provided and no notification settings found" };
            }
            if (!emailSettings.email_enabled) {
              return { error: "Email notifications are disabled for this chat" };
            }
            emailAddress = emailSettings.email;
          }

          // TODO: Implement actual email sending via Zapier MCP when available
          return {
            status: "success",
            message: `Email prepared for ${emailAddress} with subject: "${subject}". (MCP integration needed for actual sending)`
          };

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to send email: ${err.message}` };
        }
      }
    }),

    calendar_create_event_for_fee: tool({
      description: "Creates a calendar event for a fee reminder (placeholder for MCP integration).",
      parameters: {
        type: "object",
        properties: {
          fee_id: {
            type: "string",
            pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            description: "ID of the fee to create calendar event for"
          },
          title: {
            type: "string",
            description: "Custom event title"
          }
        },
        required: ["fee_id"]
      },
      execute: async ({ fee_id, title }: { fee_id: string; title?: string }) => {
        try {
          // Get fee details
          const feeResult = await executeRestrictedSQL(
            `SELECT fee_type, due_day, amount, currency, note FROM fees
             WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
            [fee_id, tenantId],
            tenantId
          );

          if (feeResult.error || (feeResult.result ?? []).length === 0) {
            return { error: "Fee not found or inactive" };
          }

          const fee = ((feeResult.result ?? [])[0] as { fee_type: string; due_day: number; amount?: number | null; currency?: string });
          const eventTitle = title || `${fee.fee_type} fee due${fee.amount ? ` (${fee.currency} ${fee.amount})` : ''}`;

          // TODO: Implement actual calendar event creation via Zapier MCP
          const externalEventId = `mock_event_${fee_id}_${Date.now()}`;

          const result = await executeRestrictedSQL(
            `INSERT INTO fee_calendar_events (tenant_id, fee_id, external_event_id, provider)
             VALUES ($1, $2, $3, 'google')
             RETURNING id, external_event_id`,
            [tenantId, fee_id, externalEventId],
            tenantId
          );

          if (result.error) {
            return { error: `Failed to store calendar event mapping: ${result.error}` };
          }

          return `✅ Calendar event prepared: "${eventTitle}" for ${fee.fee_type} fee on day ${fee.due_day}. (MCP integration needed for actual calendar creation)`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to create calendar event: ${err.message}` };
        }
      }
    }),

    calendar_cancel_event_for_fee: tool({
      description: "Cancels the calendar event for a fee reminder.",
      parameters: {
        type: "object",
        properties: {
          fee_id: {
            type: "string",
            pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            description: "ID of the fee whose calendar event should be cancelled"
          }
        },
        required: ["fee_id"]
      },
      execute: async ({ fee_id }: { fee_id: string }) => {
        try {
          // Find the calendar event mapping
          const eventResult = await executeRestrictedSQL(
            `SELECT id, external_event_id FROM fee_calendar_events
             WHERE tenant_id = $1 AND fee_id = $2`,
            [tenantId, fee_id],
            tenantId
          );

          if (eventResult.error) {
            return { error: `Failed to find calendar event: ${eventResult.error}` };
          }

          if ((eventResult.result ?? []).length === 0) {
            return "No calendar event found for this fee.";
          }

          const event = ((eventResult.result ?? [])[0] as { id: string; external_event_id: string });

          // TODO: Implement actual calendar event cancellation via Zapier MCP
          const deleteResult = await executeRestrictedSQL(
            `DELETE FROM fee_calendar_events WHERE id = $1 AND tenant_id = $2`,
            [event.id, tenantId],
            tenantId
          );

          if (deleteResult.error) {
            return { error: `Failed to remove calendar event: ${deleteResult.error}` };
          }

          return `✅ Calendar event cancelled for fee (event ID: ${event.external_event_id})`;

        } catch (error) {
          const err = error as { message?: string };
          return { error: `Failed to cancel calendar event: ${err.message}` };
        }
      }
    }),
  };
}
