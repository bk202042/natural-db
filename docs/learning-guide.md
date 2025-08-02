# Learning Guide: Building a Telegram AI Agent with Supabase

Welcome to the learning guide for the `natural-db` repository. This document will walk you through the different components of the project, explaining how they work together to create a powerful, memory-enabled AI personal assistant on Telegram.

## Table of Contents

1.  [High-Level Architecture](#1-high-level-architecture)
2.  [Core Components: The Supabase Edge Functions](#2-core-components-the-supabase-edge-functions)
    *   [Function A: `telegram-input` (The Messenger)](#function-a-telegram-input-the-messenger)
    *   [Function B: `natural-db` (The Brain)](#function-b-natural-db-the-brain)
    *   [Function C: `telegram-outgoing` (The Speaker)](#function-c-telegram-outgoing-the-speaker)
3.  [The Database Schema](#3-the-database-schema)
4.  [Key Concepts Explained](#4-key-concepts-explained)
    *   [Long-Term Memory](#long-term-memory)
    *   [Autonomous Operation with Cron Jobs](#autonomous-operation-with-cron-jobs)
    *   [Tool Usage](#tool-usage)
    *   [Evolving Personality](#evolving-personality)
5.  [Getting Started: Step-by-Step](#5-getting-started-step-by-step)

---

### 1. High-Level Architecture

This project creates an AI assistant that uses Telegram as its interface. The entire backend is powered by Supabase, which provides the database, authentication, and serverless functions (Edge Functions).

The core idea is to give a Large Language Model (LLM) like OpenAI's GPT-4 a "memory" by connecting it to a PostgreSQL database. This allows the AI to store, retrieve, and manage structured data, making it far more capable than a standard chatbot.

The data flow is simple and powerful:

`User on Telegram` -> `telegram-input` -> `natural-db` -> `telegram-outgoing` -> `User on Telegram`

---

### 2. Core Components: The Supabase Edge Functions

The project is built around three main serverless functions.

#### Function A: `telegram-input` (The Messenger)

*   **File:** `supabase/functions/telegram-input/index.ts`
*   **Purpose:** To be the secure entry point for all messages from Telegram.

**How it works:**

1.  **Webhook Receiver:** It exposes a URL that you set as your Telegram bot's webhook. All messages sent to your bot are received here.
2.  **Authentication & Validation:**
    *   It checks for a secret token (`X-Telegram-Bot-Api-Secret-Token`) to ensure the request is genuinely from Telegram.
    *   It checks if the user's Telegram username is on the `ALLOWED_USERNAMES` list.
3.  **User & Chat Management:**
    *   It creates a user profile in the `profiles` table if one doesn't exist.
    *   It handles anonymous Supabase authentication to secure subsequent database operations.
    *   It creates records in the `chats` and `chat_users` tables to manage conversations.
4.  **Timezone Setup:** If a user's timezone isn't set, it uses the LLM with a special `setTimezone` tool to ask the user for their timezone and save it. This is crucial for scheduled tasks.
5.  **Invocation:** Once all checks pass, it invokes the `natural-db` function, passing along the user's prompt and all relevant metadata.

#### Function B: `natural-db` (The Brain)

*   **File:** `supabase/functions/natural-db/index.ts`
*   **Purpose:** To be the central intelligence of the AI, processing requests and deciding on actions.

**How it works:**

1.  **Context Gathering:**
    *   It loads the recent conversation history (short-term memory).
    *   It performs a vector search on past conversations to find semantically relevant messages (long-term memory).
2.  **System Prompt Construction:** It builds a detailed system prompt for the LLM. This prompt is dynamic and includes:
    *   The structure of the user's private database schema (`memories`).
    *   A list of currently active scheduled tasks (cron jobs).
    *   Instructions on how to use its tools.
    *   The user's personalized behavior preferences.
3.  **Toolbox:** The LLM is given access to a set of powerful tools:
    *   `execute_sql`: To run SQL queries within the `memories` schema. This is the foundation of its memory.
    *   `schedule_prompt` & `unschedule_prompt`: To create and delete cron jobs for autonomous tasks.
    *   `web_search_preview`: To get real-time information from the internet.
    *   `update_system_prompt`: To modify its own personality based on user feedback.
    *   **Zapier MCP Tools (Optional):** If configured, it can interact with external services like Gmail, Slack, etc.
4.  **AI Processing:** The `generateText` function from the AI SDK is called. The LLM takes the system prompt, conversation history, and user prompt, and then decides whether to respond directly or use one or more of its tools. This can involve multiple steps.
5.  **Response Handling:**
    *   The final text response is saved to the database as an "assistant" message.
    *   The response is then passed to the `telegram-outgoing` function to be delivered.

#### Function C: `telegram-outgoing` (The Speaker)

*   **File:** `supabase/functions/telegram-outgoing/index.ts`
*   **Purpose:** To send the AI's final response back to the user.

**How it works:**

1.  **Receive Payload:** It receives the final text response and metadata from the `natural-db` function.
2.  **Final Authorization:** It performs one last check to ensure the user is still a member of the chat and is authorized to receive a message.
3.  **Send Message:** It uses the Telegram Bot API to send the formatted message to the correct user and chat.

---

### 3. The Database Schema

*   **File:** `supabase/migrations/20250623120000_create_initial_schema.sql`

The database is the heart of the AI's long-term memory. The initial migration sets up:

*   **`memories` schema:** A dedicated, isolated space where the AI can create and manage its own tables. This is its private workspace.
*   **`memories_role`:** A specific PostgreSQL role with permissions *only* to the `memories` schema. The AI operates under this role when using the `execute_sql` tool, ensuring it cannot access or damage other parts of your database.
*   **Core Tables:**
    *   `profiles`: Stores user information, including their Telegram ID, username, and timezone.
    *   `chats`: Stores information about conversations.
    *   `messages`: Stores all conversation history. The `embedding` column (using `pgvector`) stores a numerical representation of the message for semantic search.
    *   `system_prompts`: Stores different versions of the AI's personality, allowing it to evolve.
*   **Extensions:**
    *   `pg_cron`: For scheduling tasks.
    *   `pgvector`: For semantic search on message embeddings.

---

### 4. Key Concepts Explained

#### Long-Term Memory

The AI has three types of memory:
1.  **Chronological (Short-Term):** The last few messages in the conversation, providing immediate context.
2.  **Semantic (Long-Term):** Vector embeddings of all past messages allow the AI to find conceptually similar conversations, even from months ago (e.g., "remember that thing we talked about...").
3.  **Structured (Permanent):** The AI can create tables in its `memories` schema to store hard facts (e.g., a `runs` table to track your workouts). This is the most powerful form of memory.

#### Autonomous Operation with Cron Jobs

The `schedule_prompt` tool allows the AI to set up its own reminders and tasks using `pg_cron`. When a cron job fires, it calls the `natural-db` function with a special `system_routine_task` role, prompting the AI to perform a pre-defined action.

#### Tool Usage

The AI is not just a text generator; it's a "reasoning engine" that uses tools to accomplish goals. When you ask it to do something, it thinks step-by-step: "To answer this, I need to query the database. I will use the `execute_sql` tool." This makes it incredibly versatile.

#### Evolving Personality

By using the `update_system_prompt` tool, the AI can modify its own core instructions. When you say "be more formal," the AI calls this tool to add "Respond in a formal tone" to its system prompt. This new version is saved in the `system_prompts` table and used for all future conversations.

---

### 5. Getting Started: Step-by-Step

1.  **Prerequisites:**
    *   Install the **Supabase CLI**. This is the only dependency you need to manage locally.
    *   Have accounts for Supabase, OpenAI, and Telegram.
2.  **Clone & Link:**
    *   Clone the repository.
    *   Create a new Supabase project.
    *   Link your local project to your Supabase project using `supabase link`.
3.  **Deploy:**
    *   Push the database schema with `supabase db push`.
    *   Deploy the three Edge Functions with `supabase functions deploy --no-verify-jwt`.
4.  **Configure:**
    *   Set up your Telegram bot and get the token.
    *   Set the webhook to point to your `telegram-input` function's URL.
    *   Add all the required environment variables in your Supabase project settings.
5.  **Test:** Start chatting with your bot!

This guide should give you a solid foundation for understanding and extending this project. Happy building!
