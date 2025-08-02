# Dependency Analysis

This project is built on Deno, which handles dependencies differently from traditional Node.js projects. You are correct that in a Node.js environment, you would run `npm install @supabase/supabase-js`. However, Deno streamlines this process.

### How Deno Manages Dependencies

1.  **Direct URL Imports**: Instead of a `package.json` file, Deno imports modules directly from URLs in the source code.
2.  **The `npm:` Specifier**: Deno uses a special `npm:` prefix in import statements to fetch packages directly from the npm registry. For example:
    ```typescript
    import { createClient } from "npm:@supabase/supabase-js";
    ```
3.  **Automatic Caching**: When you run the code, Deno sees these `npm:` imports, automatically downloads the required packages (like `@supabase/supabase-js`), and stores them in a global cache. This is why you won't find a `node_modules` folder.

Therefore, **no explicit `npm install` commands are necessary**. The Deno runtime manages the download and caching of all dependencies automatically.

## Identified Dependencies

Across the files in `supabase/functions`, the following dependencies have been identified:

*   **`npm:@ai-sdk/openai`**: Used for interacting with the OpenAI API.
*   **`npm:ai`**: The Vercel AI SDK, used for AI-related functionalities.
*   **`npm:zod`**: A TypeScript-first schema declaration and validation library.
*   **`npm:@supabase/supabase-js`**: The official JavaScript client for Supabase.
*   **`https://deno.land/x/postgres@v0.17.0/mod.ts`**: A PostgreSQL database driver for Deno.

---

### Deno Overview

Deno is a modern, secure runtime for JavaScript, TypeScript, and WebAssembly. It is built on the V8 engine and written in Rust.

**Installation**

You can install Deno using one of the following methods:

*   **Homebrew (macOS):**
    ```zsh
    brew install deno
    ```
*   **npm:**
    ```zsh
    npm install deno-bin
    ```
*   **Shell Script:**
    ```zsh
    curl -fsSL https://deno.land/install.sh | sh
    ```
    *This installs Deno to `~/.deno` and automatically adds it to the shell's PATH. A shell restart may be required.*

**Running a Project**

To run a Deno project, use the `deno run` command. You must explicitly grant permissions for network access, file system access, etc.

*   **Example:**
    ```zsh
    deno run --allow-net app.ts
    ```

**Managing Dependencies**

Deno imports modules directly from URLs or using specifiers like `npm:`. Dependencies can be managed and cached using a `deno.json` or `package.json` file.

*   **Install all dependencies from a config file:**
    ```zsh
    deno install
    ```
*   **Add a new dependency:**
    ```zsh
    deno install [PACKAGE]
    ```
    (or `deno add [PACKAGE]`)
