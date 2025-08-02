# Supabase Edge Functions Documentation for AI Code Assist

This document contains comprehensive information about Supabase Edge Functions, extracted from the official documentation. It is structured to provide a clear and organized overview for AI Code Assist.

## 1. Overview

### What are Edge Functions?

Edge Functions are server-side TypeScript functions, distributed globally at the edge—close to your users. They can be used for listening to webhooks or integrating your Supabase project with third-parties like Stripe. Edge Functions are developed using Deno, which offers several benefits:

- **Open source**: Fully open source platform
- **Portable**: Supabase Edge Functions run locally, and on any other Deno-compatible platform (including self-hosted infrastructure)
- **TypeScript first**: Native TypeScript support and WASM compatibility
- **Globally distributed**: Low-latency execution at edge locations worldwide

### Key Features

- Server-side TypeScript execution
- Global distribution for low latency
- Webhook handling capabilities
- Third-party service integration
- Deno runtime environment
- Local development support
- Self-hosted infrastructure compatibility

### Example Use Cases

- Webhook listeners (Stripe, GitHub, etc.)
- API integrations
- Data processing
- Authentication flows
- File processing
- Real-time notifications




## 2. Quickstart (Dashboard)



### Creating and Deploying Functions via Dashboard

Supabase Dashboard provides an intuitive interface for creating, testing, and deploying Edge Functions without a local development environment. It features syntax highlighting and type-checking for Deno and Supabase-specific APIs.

**Steps:**
1.  Navigate to your Supabase project dashboard and select **Edge Functions**.
2.  Click **"Deploy a new function"** and choose **"Via Editor"**.
3.  Select a pre-built template (e.g., "Hello World") or start from scratch.
4.  Modify the code as needed in the editor.
5.  Click **"Deploy function"**.

**Deployment:**
- Functions are automatically distributed globally.
- Example URL: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/hello-world`

### Testing Functions in Dashboard

Supabase Dashboard includes built-in tools for testing Edge Functions with various request payloads, headers, and query parameters.

**Steps:**
1.  On your function's details page, click the **"Test"** button.
2.  Configure HTTP Method, Headers, Query Parameters, Request Body, and Authorization.
3.  Click **"Send Request"**.

### Invoking Deployed Functions

To invoke deployed functions from your application, use API keys found in **Settings > API Keys**:
- **Anon Key**: For client-side requests (safe with RLS enabled).
- **Service Role Key**: For server-side requests (keep secret, bypasses RLS).

**Example (Supabase Client):**
```javascript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://[YOUR_PROJECT_ID].supabase.co', 'YOUR_ANON_KEY')
const { data, error } = await supabase.functions.invoke('hello-world', {
  body: { name: 'JavaScript' },
})
console.log(data) // { message: "Hello JavaScript!" }
```

### AI Assistant for Function Generation

Supabase's AI Assistant can automatically generate and deploy functions:
1.  Go to your project > **Deploy a new function** > **Via AI Assistant**.
2.  Describe the desired function in the prompt.
3.  Click **Deploy**.

### Local Development and Redeployment

To work with Edge Functions locally, download the source code via the dashboard or CLI.

**Downloading via Dashboard:**
1.  Go to your function's page.
2.  Click the **"Download"** button in the top right corner.

**Downloading via CLI:**
```bash
supabase link --project-ref [project-ref]
supabase functions list
supabase functions download hello-world
```

**Local Testing and Redeployment:**
```bash
supabase functions serve hello-world
supabase functions deploy hello-world
```

**Important Note:** The Dashboard's Edge Function editor currently **does not support version control, versioning, or rollbacks**. It is recommended for quick testing and prototypes only.




## 3. Quickstart (CLI)



### Creating and Deploying Functions via CLI

The Supabase CLI allows you to create, test, and deploy Edge Functions from your local development environment.

**Prerequisites:**
- Supabase CLI installed.

**Steps:**
1.  **Initialize a new project (if needed):**
    ```bash
    supabase init my-edge-functions-project
    cd my-edge-functions-project
    ```
    Or navigate to an existing project and run `supabase init`.

2.  **Generate a new Edge Function:**
    ```bash
    supabase functions new hello-world
    ```
    This creates `supabase/functions/hello-world/index.ts` with a basic template.

3.  **Start local development server:**
    ```bash
    supabase start
    supabase functions serve hello-world
    ```
    Your function will be running at `http://localhost:54321/functions/v1/hello-world`.

4.  **Test your function locally (using curl):**
    ```bash
    curl -i --location --request POST 'http://localhost:54321/functions/v1/hello-world' \
      --header 'Authorization: Bearer SUPABASE_ANON_KEY' \
      --header 'Content-Type: application/json' \
      --data '{"name":"Functions"}'
    ```
    (Run `supabase status` to get your local `SUPABASE_ANON_KEY`)

5.  **Authenticate and link to your Supabase project:**
    ```bash
    supabase login
    supabase projects list
    supabase link --project-ref [YOUR_PROJECT_ID]
    ```

6.  **Deploy your function globally:**
    ```bash
    supabase functions deploy hello-world
    # Or to deploy all functions:
    supabase functions deploy
    ```
    - Use `--use-api` for API-based deployment (Docker not required).
    - Use `--no-verify-jwt` to skip JWT verification (use with caution for webhooks).

**Invoking Deployed Functions:**
Your function will be live at `https://[YOUR_PROJECT_ID].supabase.co/functions/v1/hello-world`.

**Example (curl):**
```bash
curl --request POST 'https://[YOUR_PROJECT_ID].supabase.co/functions/v1/hello-world' \
  --header 'Authorization: Bearer SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Production"}'
```
(Get your production `SUPABASE_ANON_KEY` from your Supabase dashboard under **Settings > API**.)

**Example (Supabase Client):**
```javascript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://[YOUR_PROJECT_ID].supabase.co', 'YOUR_ANON_KEY')
const { data, error } = await supabase.functions.invoke('hello-world', {
  body: { name: 'JavaScript' },
})
console.log(data) // { message: "Hello JavaScript!" }
```




## 4. Development Environment



### Local Development Environment Setup

To develop Supabase Edge Functions locally, you need the Supabase CLI. The CLI uses its own Edge Runtime for consistency between development and production environments.

**Deno Installation:**
While the Supabase CLI handles the runtime, installing Deno separately allows you to leverage Deno LSP for improved editor features (autocompletion, type checking, testing) and built-in tools (`deno fmt`, `deno lint`, `deno test`).

**Editor Setup (VSCode):**
1.  Install the Deno extension from the VSCode marketplace.
2.  **Option 1 (Auto-generate):** When running `supabase init`, select `y` when prompted "Generate VS Code settings for Deno? [y/N]".
3.  **Option 2 (Manual setup):** Create a `.vscode/settings.json` in your project root:
    ```json
    {
      "deno.enablePaths": ["./supabase/functions"],
      "deno.importMap": "./supabase/functions/import_map.json"
    }
    ```
    This configures Deno language server only for the `supabase/functions` folder.

**Multi-root Workspaces:**
For projects with multiple repositories or microservices, use a multi-root workspace (e.g., `edge-functions.code-workspace`):
```json
{
  "folders": [
    {
      "name": "project-root",
      "path": "./"
    },
    {
      "name": "test-client",
      "path": "app"
    },
    {
      "name": "supabase-functions",
      "path": "supabase/functions"
    }
  ],
  "settings": {
    "files.exclude": {
      "node_modules/": true,
      "app/": true,
      "supabase/functions/": true
    },
    "deno.importMap": "./supabase/functions/import_map.json"
  }
}
```

### Recommended Project Structure

```
└── supabase
    ├── functions
    │   ├── import_map.json     # Top-level import map
    │   ├── _shared             # Shared code (underscore prefix)
    │   │   ├── supabaseAdmin.ts # Supabase client with SERVICE_ROLE key
    │   │   ├── supabaseClient.ts # Supabase client with ANON key
    │   │   └── cors.ts         # Reusable CORS headers
    │   ├── function-one        # Use hyphens for function names
    │   │   └── index.ts
    │   └── function-two
    │       └── index.ts
    ├── tests
    │   ├── function-one-test.ts
    │   └── function-two-test.ts
    ├── migrations
    └── config.toml
```

**Best Practices for Structure:**
- **"Fat functions"**: Combine related functionality into fewer, larger functions to minimize cold starts.
- **Hyphenated names**: Use hyphens (`-`) for function names for URL-friendliness.
- **Shared code**: Store reusable code in folders prefixed with an underscore (`_shared`).
- **Separate tests**: Keep unit tests in a separate `tests` folder, named with a `-test` suffix (e.g., `function-one-test.ts`).

### Common CLI Commands for Development

- **`supabase start`**: Spins up the entire local Supabase stack (database, auth, storage, Edge Functions runtime).
- **`supabase functions serve [function-name]`**: Develop a specific function with hot reloading. Functions run at `http://localhost:54321/functions/v1/[function-name]`.
- **`supabase functions serve`**: Serves all functions at once.
- **`supabase functions serve --no-verify-jwt`**: Serves an Edge Function without default JWT verification (useful for webhooks). Use with caution as it allows public access.
- **`supabase functions deploy [function-name]`**: Deploys the function to production.




## 5. Environment Variables



### Accessing Environment Variables

Edge Functions have access to several built-in secrets:
- `SUPABASE_URL`: API gateway for your Supabase project.
- `SUPABASE_ANON_KEY`: `anon` key for your Supabase API (safe for client-side with RLS).
- `SUPABASE_SERVICE_ROLE_KEY`: `service_role` key (use in Edge Functions only, bypasses RLS).
- `SUPABASE_DB_URL`: URL for your Postgres database.

You can access these using Deno's built-in handler:
```typescript
Deno.env.get("NAME_OF_SECRET")
```

**Example:**
```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

// For user-facing operations (respects RLS)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

// For admin operations (bypasses RLS)
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

### Managing Environment Variables in Development

In development, environment variables can be loaded in two ways:
1.  **`.env` file**: Place an `.env` file at `supabase/functions/.env`. It's automatically loaded on `supabase start`.
2.  **`--env-file` option**: Use `supabase functions serve --env-file .env.local` to specify a custom `.env` file.

**Important:** Never commit `.env` files to Git. Add them to your `.gitignore`.

**Example of accessing custom secrets:**
```typescript
const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
```

**Serving functions with environment variables:**
```bash
supabase functions serve hello-world # Loads from supabase/functions/.env
supabase functions serve hello-world --env-file .env.local # Loads from custom file
```

### Managing Environment Variables in Production

Production secrets can be set via the Supabase Dashboard or CLI.

**Using the Dashboard:**
1.  Visit the Edge Function Secrets Management page in your Dashboard.
2.  Add Key and Value for your secret and save.

**Using the CLI:**
Create a `.env` file (e.g., `secrets.env`):
```
STRIPE_SECRET_KEY=sk_live_...
```
Push secrets to your remote project:
```bash
supabase secrets set --env-file secrets.env
# Or set individually:
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
```

To list all remote secrets:
```bash
supabase secrets list
```

Secrets are available immediately after setting them; no redeployment is needed.




## 6. Managing Dependencies



### Dependency Management in Edge Functions

Supabase Edge Functions support various dependency import methods:
- **NPM packages**: `import { createClient } from 'npm:@supabase/supabase-js@2';`
- **Built-in Node APIs**: `import process from 'node:process';`
- **JSR or deno.land/x modules**: `import path from 'jsr:@std/path@1.0.8';`

#### `deno.json` for Dependency Management (Recommended)

Each function should have its own `deno.json` file for isolated dependency management and Deno-specific settings. This prevents version conflicts between functions.

**Example `deno.json`:**
```json
{
  "imports": {
    "supabase": "npm:@supabase/supabase-js@2",
    "lodash": "https://cdn.skypack.dev/lodash"
  }
}
```

**File Structure:**
```
└── supabase
    ├── functions
    │   ├── function-one
    │   │   ├── index.ts
    │   │   └── deno.json    # Function-specific Deno configuration
    │   └── function-two
    │       ├── index.ts
    │       └── deno.json    # Function-specific Deno configuration
    └── config.toml
```

#### Import Maps (Legacy)

Import Maps are an older method for dependency management. If both `deno.json` and `import_map.json` exist, `deno.json` takes precedence.

**Example `import_map.json`:**
```json
# /function-one/import_map.json
{
  "imports": {
    "lodash": "https://cdn.skypack.dev/lodash"
  }
}
```

**VSCode Configuration for Import Maps:**
Update `.vscode/settings.json` to point to the function-specific import map:
```json
{
  "deno.enable": true,
  "deno.unstable": ["bare-node-builtins", "byonm"],
  "deno.importMap": "./supabase/functions/function-one/import_map.json"
}
```

**Overriding Import Map Location:**
You can override the default import map location using the `--import-map <string>` flag with `serve` and `deploy` commands, or by setting the `import_map` property in your `config.toml` file:
```toml
[functions.my-function]
import_map = "./supabase/functions/function-one/import_map.json"
```

#### Private NPM Packages

To use private NPM packages, create a `.npmrc` file within your function’s directory (requires Supabase CLI v1.207.9+).

**File Structure:**
```
└── supabase
    └── functions
        └── my-function
            ├── index.ts
            ├── deno.json
            └── .npmrc       # Function-specific npm configuration
```

**Example `.npmrc`:**
```
@myorg:registry=https://npm.registryhost.com/
//npm.registryhost.com/:_authToken=VALID_AUTH_TOKEN
```

**Importing Private Packages:**
```typescript
import package from 'npm:@myorg/private-package@v1.0.1';
```

**Custom NPM Registry:**
Specify a custom NPM registry using the `NPM_CONFIG_REGISTRY` environment variable:
```bash
NPM_CONFIG_REGISTRY=https://custom-registry/ supabase functions deploy my-function
```

#### Type Support

If your environment is set up correctly and the module exports types, you will have type and autocompletion support.

**For packages without built-in types:**
Use `@deno-types` directive:
```typescript
// @deno-types="npm:@types/express@^4.17"
import express from 'npm:express@^4.17';
```

**For built-in Node APIs:**
Add the following reference at the top of your imports:
```typescript
/// <reference types="npm:@types/node" />
```




## 7. Function Configuration



### Function Configuration

Edge Functions allow per-function configuration to customize behavior, such as authentication, dependencies, and entry points. This is managed through the `supabase/config.toml` file in your project root.

**Example `config.toml`:**
```toml
# Disables authentication for the Stripe webhook.
[functions.stripe-webhook]
verify_jwt = false

# Custom dependencies for this specific function
[functions.image-processor]
import_map = './functions/image-processor/import_map.json'

# Custom entrypoint for legacy function using JavaScript
[functions.legacy-processor]
entrypoint = './functions/legacy-processor/index.js'
```

#### JWT Verification

By default, Edge Functions require a valid JWT. To disable this for specific functions (e.g., webhooks), set `verify_jwt = false` in `config.toml`:

```toml
[functions.stripe-webhook]
verify_jwt = false
```

Alternatively, use the `--no-verify-jwt` flag when serving locally:
```bash
supabase functions serve hello-world --no-verify-jwt
```
**Caution:** Disabling JWT verification allows anyone to invoke your function.

#### Custom Entrypoints

(Available in Supabase CLI v1.215.0 or higher)

You can specify a custom entry point for your function, allowing you to use JavaScript (`.js`), JSX (`.jsx`), TSX (`.tsx`), or MJS (`.mjs`) files instead of the default TypeScript (`.ts`).

To set a custom entry point, update `supabase/config.toml`:

```toml
[functions.hello-world]
entrypoint = './index.js' # path must be relative to config.toml
```




## 8. Error Handling



### Error Handling in Edge Functions

Proper error handling in Edge Functions involves returning appropriate HTTP status codes and informative error messages, and handling different types of errors on the client-side.

**Server-side (within Edge Function):**

```typescript
Deno.serve(async (req) => {
  try {
    // Your function logic here
    const result = await processRequest(req);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

**Best Practices for Function Errors:**
- Use appropriate HTTP status codes (e.g., `400` for bad input, `404` for not found, `500` for server errors).
- Include helpful error messages in the response body.
- Log errors to the console for debugging (visible in the Supabase Dashboard Logs).

**Client-side Error Handling:**

Edge Functions can throw three types of errors on the client-side:
- `FunctionsHttpError`: Function executed but returned an error (4xx/5xx status).
- `FunctionsRelayError`: Network issue between client and Supabase.
- `FunctionsFetchError`: Function could not be reached.

```typescript
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";

const { data, error } = await supabase.functions.invoke("hello", {
  headers: { "my-custom-header": "my-custom-header-value" },
  body: { foo: "bar" },
});

if (error instanceof FunctionsHttpError) {
  const errorMessage = await error.context.json();
  console.log("Function returned an error", errorMessage);
} else if (error instanceof FunctionsRelayError) {
  console.log("Relay error:", error.message);
} else if (error instanceof FunctionsFetchError) {
  console.log("Fetch error:", error.message);
}
```

Properly handling these errors on the client-side is crucial for debugging and maintaining reliable applications.




## 9. Routing



### Handling Routing in Edge Functions

To reduce cold starts and improve performance, it is often beneficial to combine multiple actions into a single Edge Function, especially for related operations like a CRUD API. This allows one instance to handle various requests.

**Benefits of combining actions:**
- Reduce cold starts.
- Build complete REST APIs in a single function.
- Improve performance by keeping one instance warm for multiple endpoints.

**Web Application Frameworks:**
You can use web application frameworks like Express, Oak, or Hono to combine multiple endpoints into a single Edge Function.

**Example using Hono:**
```typescript
import { Hono } from "jsr:@hono/hono";

const app = new Hono();

app.post("/hello-world", async (c) => {
  const { name } = await c.req.json();
  return new Response(`Hello ${name}!`);
});

app.get("/hello-world", (c) => {
  return new Response("Hello World!");
});

Deno.serve(app.fetch);
```

**Important Considerations for Paths:**
- Paths within Edge Functions should always be prefixed with the function name (e.g., `hello-world`).
- Route parameters (e.g., `/tasks/:taskId/notes/:noteId`) can be used after the function name prefix.

**Example of a simple CRUD API without a framework:**
```typescript
interface Task {
  id: string;
  name: string;
}

let tasks: Task[] = [];

async function getAllTasks(): Promise<Response> {
  return new Response(JSON.stringify(tasks));
}

async function getTask(id: string): Promise<Response> {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    return new Response(JSON.stringify(task));
  } else {
    return new Response("Task not found", { status: 404 });
  }
}

async function createTask(req: Request): Promise<Response> {
  const id = Math.random().toString(36).substring(7);
  const task = { id, name: "" };
  tasks.push(task);
  return new Response(JSON.stringify(task), { status: 201 });
}

async function updateTask(id: string, req: Request): Promise<Response> {
  const index = tasks.findIndex((t) => t.id === id);
  if (index !== -1) {
    tasks[index] = { ...tasks[index] };
    return new Response(JSON.stringify(tasks[index]));
  } else {
    return new Response("Task not found", { status: 404 });
  }
}

async function deleteTask(id: string): Promise<Response> {
  const index = tasks.findIndex((t) => t.id === id);
  if (index !== -1) {
    tasks.splice(index, 1);
    return new Response("Task deleted successfully");
  } else {
    return new Response("Task not found", { status: 404 });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const method = req.method;
  const command = url.pathname.split("/").pop();
  const id = command;

  try {
    switch (method) {
      case "GET":
        if (id) {
          return getTask(id);
        } else {
          return getAllTasks();
        }
      case "POST":
        return createTask(req);
      case "PUT":
        if (id) {
          return updateTask(id, req);
        } else {
          return new Response("Bad Request", { status: 400 });
        }
      case "DELETE":
        if (id) {
          return deleteTask(id);
        } else {
          return new Response("Bad Request", { status: 400 });
        }
      default:
        return new Response("Method Not Allowed", { status: 405 });
    }
  } catch (error) {
    return new Response(`Internal Server Error: ${error}`, { status: 500 });
  }
});
```

**URL Pattern API:**
For smaller applications, you can directly use the URL Pattern API for routing:

```typescript
// ...
// For more details on URLPattern, check https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API
const taskPattern = new URLPattern({ pathname: "/restful-tasks/:id" });
const matchingPath = taskPattern.exec(url);
const id = matchingPath ? matchingPath.pathname.groups.id : null;
let task = null;
if (method === "POST" || method === "PUT") {
  const body = await req.json();
  task = body.task;
}
// call relevant method based on method and id
switch (true) {
  case id && method === "GET":
    return getTask(supabaseClient, id as string);
  case id && method === "PUT":
    return updateTask(supabaseClient, id as string, task);
  case id && method === "DELETE":
    return deleteTask(supabaseClient, id as string);
  case method === "POST":
    return createTask(supabaseClient, task);
  case method === "GET":
    return getAllTasks(supabaseClient);
  default:
    return getAllTasks(supabaseClient);
// ...
```




## 10. Deploy to Production



### Deploying Edge Functions to Production

After developing Edge Functions locally, you can deploy them to your remote Supabase project.

**Prerequisites:**
- Supabase CLI installed.

**Deployment Steps:**
1.  **Log in to Supabase CLI:**
    ```bash
    supabase login
    ```
2.  **Get your project ID:**
    ```bash
    supabase projects list
    ```
3.  **Link your local project to your remote Supabase project:**
    ```bash
    supabase link --project-ref your-project-id
    ```
4.  **Deploy your functions:**
    - To deploy all functions in the `functions` folder:
      ```bash
      supabase functions deploy
      ```
    - To deploy an individual function:
      ```bash
      supabase functions deploy hello-world
      ```
    - To deploy without JWT verification (e.g., for webhooks):
      ```bash
      supabase functions deploy hello-world --no-verify-jwt
      ```
      **Caution:** Use `--no-verify-jwt` carefully, as it allows anyone to invoke your function without authentication.

**Post-Deployment:**
- Your function is automatically distributed globally.
- It will be running at `https://[YOUR_PROJECT_ID].supabase.co/functions/v1/hello-world`.

**Invoking Deployed Functions:**
Use your project's `ANON_KEY` (found in Supabase Dashboard > Settings > API) to invoke the function.

**Example (curl):**
```bash
curl --request POST 'https://[YOUR_PROJECT_ID].supabase.co/functions/v1/hello-world' \
  --header 'Authorization: Bearer SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Production"}'
```

**CI/CD Deployment:**
You can automate Edge Function deployments using CI/CD tools like GitHub Actions, GitLab CI, and Bitbucket Pipelines.

**GitHub Actions Example:**
```yaml
name: Deploy Function
on:
  push:
    branches:
      - main
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_ID: your-project-id
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase functions deploy --project-ref $PROJECT_ID
```

**Function Configuration in `config.toml`:**
Individual function configurations (like JWT verification and import map location) can be set in `supabase/config.toml`.

**Example `config.toml` snippet:**
```toml
[functions.hello-world]
verify_jwt = false
```
This ensures consistent function configurations across environments.




## 11. Regional Invocations



### Regional Invocations

Edge Functions automatically execute in the region closest to the user. However, for intensive database or storage operations, executing in the same region as your database can provide better performance.

**Supported Regions:**
- **Asia Pacific:** `ap-northeast-1` (Tokyo), `ap-northeast-2` (Seoul), `ap-south-1` (Mumbai), `ap-southeast-1` (Singapore), `ap-southeast-2` (Sydney)
- **North America:** `ca-central-1` (Canada Central), `us-east-1` (N. Virginia), `us-west-1` (N. California), `us-west-2` (Oregon)
- **Europe:** `eu-central-1` (Frankfurt), `eu-west-1` (Ireland), `eu-west-2` (London), `eu-west-3` (Paris)
- **South America:** `sa-east-1` (São Paulo)

**Specifying Region:**
You can specify the execution region programmatically using the Supabase Client library or the `x-region` HTTP header.

**Example (JavaScript):**
```typescript
import { createClient, FunctionRegion } from "@supabase/supabase-js";

const { data, error } = await supabase.functions.invoke("function-name", {
  // ...
  region: FunctionRegion.UsEast1, // Execute in us-east-1 region
});
```

If the `x-region` header cannot be added (e.g., CORS, Webhooks), use the `forceFunctionRegion` query parameter.

**Verifying Execution Region:**
Check the `x-sb-edge-region` HTTP header in the response or in the Edge Function Logs.

**Important Notes:**
- Explicitly specifying a region prevents automatic re-routing to other regions.
- During outages, consider temporarily changing to a different region.
- Test your function's performance with and without regional specification to determine optimal configuration.
