Deno is a modern, secure JavaScript and TypeScript runtime that offers a comprehensive command-line interface (CLI) and a robust set of built-in tools for various development tasks. It operates on the principle of **security by default**, meaning that programs do not have access to sensitive system I/O (like file system, network, or environment variables) unless explicitly granted.

Here's a detailed overview of Deno's features and capabilities:

### Core Functionality and CLI
Deno functions as a command-line program, allowing you to **run scripts, manage dependencies, and even compile code into standalone executables**. Its CLI includes numerous subcommands for different tasks, such as `deno run`, `deno init`, `deno test`, `deno fmt`, and `deno lint`.

You can execute local TypeScript or JavaScript files by specifying their path, or run scripts directly from URLs, which is useful for quick testing. Deno also supports running scripts by piping them through standard input. When passing arguments to a script, they must be placed **after the script name**.

Deno offers various common flags to customize behavior:
*   **`--watch`**: Enables a built-in file watcher for `deno run`, `deno test`, and `deno fmt`, automatically reloading the application when source files change. You can exclude paths from watching using `--watch-exclude`.
*   **`--watch-hmr`**: (Hot Module Replacement mode) with `deno run` attempts to update the program in-place instead of restarting.
*   **Integrity Flags**: `--lock` checks a specified lock file, and `--frozen` errors out if the lockfile is out of date, preventing unexpected dependency changes.
*   **Cache and Compilation Flags**: `--config` loads a configuration file, `--import-map` loads an import map, `--no-remote` prevents remote module resolution, and `--reload` forces recompilation of the source code cache. The `--unstable` flag enables unstable APIs.
*   **Runtime Flags**: Include options like `--cached-only` (requires remote dependencies to be already cached), `--inspect`, `--inspect-brk`, `--inspect-wait` (for debugging), `--location`, `--prompt` (for permission prompts), `--seed`, and `--v8-flags`.

### Debugging Capabilities
Deno provides robust debugging support through the **V8 Inspector Protocol**, compatible with tools like Chrome DevTools, VSCode, and JetBrains IDEs.
*   **`--inspect`**: Starts your program with an inspector server, allowing client connections. Code execution begins immediately.
*   **`--inspect-wait`**: Pauses program execution until a debugger connects.
*   **`--inspect-brk`**: The most commonly used flag, it waits for a debugger to connect and then sets a breakpoint at the program's start.
*   For more detailed debugging information, you can use **`--log-level=debug`**.
*   The **`--strace-ops`** flag prints out all Deno operations (RPC between JavaScript and Rust) along with their timings, which is useful for performance profiling and understanding Deno's internal workings.

### New Features in Deno 2.4
Deno 2.4 introduced several significant enhancements:
*   **`deno bundle` is back**: This subcommand allows you to create single-file JavaScript or TypeScript bundles, supporting both server-side and browser platforms, npm and JSR dependencies, and automatic tree shaking and minification via esbuild.
*   **Importing Text and Bytes**: You can now directly include data files like markdown, icons, or binary blobs into your JavaScript module graph using import attributes with `type: "text"` or `type: "bytes"`. This experimental feature requires the `--unstable-raw-imports` flag. These imports integrate with `deno bundle` and `deno compile`, allowing assets to be embedded in compiled binaries.
*   **Stable OpenTelemetry Integration**: Deno's built-in OpenTelemetry support is now stable, automatically collecting logs, metrics, and traces for your project. Enable it by setting the `OTEL_DENO=1` environment variable.
*   **`--preload` Flag**: Executes a script before your main application, enabling modification of globals, loading data, or connecting to databases in a clean way.
*   **`deno update` Subcommand**: Simplifies dependency management by updating npm and JSR dependencies to their latest semver-compatible versions.
*   **`deno run --coverage`**: Collects coverage information for scripts, including those run as subprocesses, complementing `deno test --coverage`.
*   **`DENO_COMPAT=1` Environment Variable**: Improves ergonomics for `package.json`-first projects by enabling a set of unstable flags (e.g., `--unstable-detect-cjs`, `--unstable-node-globals`).
*   **Enhanced Permissions**: `--allow-net` now supports subdomain wildcards and CIDR ranges. A new `--deny-import` flag allows explicitly blocking certain hosts for code imports. `Deno.execPath()` no longer requires read permissions, improving security in some scenarios.
*   **`deno run` Bare Specifiers**: Deno now supports using bare specifiers (defined in import maps) as entry points for `deno run`, simplifying command execution.
*   **`deno fmt` XML and SVG**: The built-in formatter now automatically formats `.xml` and `.svg` files.
*   **Improved `tsconfig.json` Support**: Deno 2.4 brings better handling for `tsconfig.json` files, with added support for `references`, `extends`, `files`, `include`, and `exclude` options, improving compatibility with popular frontend frameworks.
*   **Simpler Node Globals**: `Buffer`, `global`, `setImmediate`, and `clearImmediate` are now available to user code by default, simplifying migration for existing Node.js projects.
*   **Node.js API Support**: Significant improvements to Node.js API compatibility, including `fs.glob` and over 95% compatibility for `node:buffer`, `node:events`, and other core modules. Deno 2.4 also uses `@types/node` version 22.15.14 for type checking by default.

### Deno Namespace APIs
The global `Deno` namespace provides non-web standard APIs for interacting with the system:
*   **File System**: Functions like `Deno.readTextFile` and `Deno.writeTextFile` require explicit `--allow-read` and `--allow-write` permissions.
*   **Network**: `Deno.connect` and `Deno.listen` enable network connections and listening, requiring the `--allow-net` flag.
*   **Subprocesses**: `Deno.Command` allows spinning up subprocesses, which requires the `--allow-run` flag.
*   **HTTP Server**: `Deno.serve` is the preferred higher-level API for creating HTTP servers, while `Deno.serveHttp` offers lower-level control. `Deno.serve` now supports `onListen()` callbacks.
*   **Permissions API**: `Deno.permissions.query`, `Deno.permissions.request`, and `Deno.permissions.revoke` allow programs to interact with the permission system at runtime. Permissions can be in "granted", "prompt", or "denied" states.
*   **`import.meta`**: Provides information about the current module, including `import.meta.url`, `import.meta.main` (if it's the entry point), `import.meta.filename` (for local modules), `import.meta.dirname` (for local modules), and `import.meta.resolve` (which respects import maps).
*   **Foreign Function Interface (FFI)**: The FFI API (`Deno.dlopen`) enables calling libraries written in native languages (like C/C++, Rust) that support C ABIs, requiring `--allow-ffi` and `--unstable` flags. It supports non-blocking calls and callbacks via `Deno.UnsafeCallback`. `deno_bindgen` simplifies glue code generation for Rust FFI libraries.
*   **Program Lifecycle**: Deno supports browser-compatible lifecycle events like `load`, `beforeunload`, `unload`, `unhandledrejection`, and `rejectionhandled`, allowing for setup and cleanup code.

### Modules and Dependencies
Deno uses **ECMAScript modules (ESM)** as its default module system, requiring full file extensions for local imports.
*   **Import Attributes**: Beyond JSON, Deno 2.4 supports importing text and bytes using `with { type: "text" }` or `with { type: "bytes" }`.
*   **Third-party Modules**: Deno strongly recommends **JSR** (`jsr:`) as the modern JavaScript registry for third-party modules, but also has native support for **npm packages** (`npm:`). While HTTPS imports (`https://`) are supported, they are cautioned against for larger applications due to potential versioning issues.
*   **Import Maps**: The `imports` field in `deno.json` centralizes dependency management, mapping bare specifiers to URLs or file paths, leading to cleaner code.
*   **Dependency Management Commands**: `deno add` automatically adds the latest version of a package to your `deno.json` import map, and `deno remove` removes them.
*   **Package Versions**: Deno supports semver versioning for package imports, allowing specific versions or ranges (e.g., `@1.2.3`, `^1.2.3`, `~1.2.3`).
*   **Overriding Dependencies**: The `links` field (formerly `patch`) in `deno.json` allows overriding dependencies with local packages for development or debugging, similar to `npm link`. The `scopes` field enables overriding HTTPS imports with local patched versions.
*   **Vendoring**: You can store external dependencies locally in a `vendor` directory using `"vendor": true` in `deno.json` or `deno install --entrypoint`.
*   **Lock Files**: Deno uses `deno.lock` files to ensure module integrity by recording exact versions and integrity hashes of dependencies. The `--frozen` flag can be used to enforce strict integrity, causing an error if dependencies change.
*   **Private Repositories**: Deno supports fetching remote modules from private repositories using bearer tokens or basic authentication specified via the `DENO_AUTH_TOKENS` environment variable.

### Node and npm Compatibility
Deno is highly **Node-compatible**, allowing most Node projects to run with minimal changes.
*   **Native npm Support**: Deno has native support for importing npm packages using `npm:` specifiers (e.g., `import { Hono } from "npm:hono"`). This generally eliminates the need for `npm install` or a `node_modules` folder, as dependencies are cached globally. Install hooks for npm packages will run if `--allow-scripts` is granted, with a clear prompt for security.
*   **Node.js Built-in Modules**: Node's built-in APIs (like `os`, `fs`, `http`) can be used by adding the `node:` specifier (e.g., `import * as os from "node:os"`).
*   **CommonJS Support**: Deno offers full support for CommonJS modules. It automatically detects CJS modules, and you can explicitly mark them with a `.cjs` extension or a `package.json` file with `"type": "commonjs"`. You can also use `createRequire()` from `node:module` to manually create a `require()` function. Deno's permission system still applies to CommonJS modules.
*   **`node_modules` Directory**: By default, Deno uses a global npm cache. However, you can configure Deno to create a local `node_modules` directory using the `nodeModulesDir` field in `deno.json` (options: `"none"`, `"auto"`, `"manual"`). `"auto"` mode is recommended for projects with npm dependencies that rely on `node_modules` (e.g., bundlers, postinstall scripts).
*   **Node.js Global Objects**: Common Node.js globals like `process`, `Buffer`, `__filename`, and `__dirname` are handled, with recommendations to import them explicitly (e.g., `Buffer` from `node:buffer`) or use Deno's `import.meta` equivalents.
*   **Node-API Addons**: Deno supports Node-API addons used by some npm packages, but they require a `node_modules/` directory to be present and `--allow-ffi` permission.
*   **Migration**: Deno provides a straightforward migration path for Node.js projects, including support for running npm scripts via `deno task`.

### Configuration (`deno.json` and `package.json`)
Deno projects are configured using a `deno.json` (or `deno.jsonc`) file, which can define TypeScript compiler options, linting rules, formatting preferences, tasks, and more.
*   **`imports`**: Used for specifying dependencies and custom path mappings.
*   **`links`**: Allows overriding dependencies with local packages on disk.
*   **`tasks`**: Defines custom commands executable via `deno task`.
*   **`lint`**: Configures Deno's built-in linter, including files, excluding paths, and specifying rules.
*   **`fmt`**: Configures Deno's built-in formatter, controlling indentation, line width, quotes, semicolons, and file inclusion/exclusion.
*   **`lock`**: Manages the lock file for dependency integrity.
*   **`nodeModulesDir`**: Configures local `node_modules` directory behavior.
*   **`compilerOptions`**: Sets TypeScript compiler configurations.
*   **`unstable`**: Explicitly enables experimental, unstable features.
*   **`include` and `exclude`**: Common properties across many configurations (lint, fmt, test) for specifying files, with `exclude` having higher precedence. A top-level `exclude` can apply to all subcommands.

### Security and Permissions
Deno's security model is fundamental:
*   **No I/O Access by Default**: Programs are sandboxed and cannot access file systems, networks, or environment variables without explicit permission.
*   **Explicit Permission Grants**: Access is granted using command-line flags (e.g., `--allow-read`, `--allow-write`, `--allow-net`, `--allow-env`, `--allow-run`, `--allow-ffi`, `--allow-sys`, `--allow-import`).
*   **`--deny-*` Flags**: Can explicitly disallow access to specific resources, taking precedence over `allow` flags.
*   **`--allow-all` (`-A`)**: A flag that completely disables the security sandbox, granting all permissions. This should be used with extreme caution.
*   **Permission Prompts**: Deno can prompt users at runtime for ungranted permissions, which can be disabled with `--no-prompt`.
*   **Trusted Remote Module Imports**: Deno allows importing modules from specific trusted public registries (e.g., `deno.land`, `jsr.io`, `esm.sh`) by default without requiring `--allow-net`. Dynamic imports from other web hosts require `--allow-import`.
*   **Subprocess Permissions**: Child processes spawned by Deno run independently of the parent's permissions, which means they can escalate privileges. Therefore, granting `--allow-run` should be done carefully, ideally by limiting the allowed programs.
*   **FFI Security**: Loading dynamic libraries via FFI (`--allow-ffi`) also runs outside Deno's sandbox and requires extreme caution.

### Testing
Deno has a **built-in test runner** that supports both JavaScript and TypeScript, eliminating the need for external test frameworks.
*   **Defining Tests**: Tests are defined using the `Deno.test()` function, which supports synchronous and asynchronous tests, and can include specific permissions for individual tests. The `@std/assert` and `@std/expect` modules provide assertion utilities.
*   **Running Tests**: The `deno test` subcommand automatically finds and executes tests. Tests can be run in parallel with `--parallel`.
*   **Test Steps**: `Deno.test` supports steps (`t.step()`) for breaking down tests into smaller, manageable parts, useful for setup and teardown.
*   **Filtering**: Tests can be filtered from the command line using `--filter` (string or pattern).
*   **Selection**: Individual tests can be ignored (`ignore: true` or `Deno.test.ignore()`) or explicitly run (`only: true` or `Deno.test.only()`), though using `only` will cause the overall test run to fail as it's intended for temporary debugging.
*   **Coverage**: The `--coverage` flag with `deno test` collects coverage information from the V8 engine, which can then be processed by `deno coverage`.
*   **Documentation Tests**: Deno can evaluate code snippets in JSDoc or markdown files using `deno test --doc` or `deno check --doc-only`, ensuring documentation examples are functional.
*   **Sanitizers**: The test runner includes built-in sanitizers (resource, async operation, exit) to ensure tests do not leak resources, leave pending async operations, or call `Deno.exit()`. These are enabled by default but can be disabled per test.
*   **Snapshot Testing**: The `@std/snapshot` module allows comparing values against reference snapshots, helpful for catching bugs with minimal code.

### TypeScript Support
TypeScript is a **first-class language** in Deno, with a built-in compiler that requires no extra configuration.
*   **Type Checking**: Deno type checks TypeScript in `strict mode` by default. You can type-check code without execution using `deno check`. By default, `deno run` skips type-checking; use `--check` or `--check=all` to enable it.
*   **JavaScript Type Checking**: JavaScript files can be type-checked by adding `// @ts-check` or `compilerOptions.checkJs: true` in `deno.json`.
*   **Declaration Files (`.d.ts`)**: For untyped JavaScript modules, you can provide type information via `.d.ts` files, specified in the source file (`// @ts-self-types`) or the importing TypeScript file (`// @ts-types`), or via `X-TypeScript-Types` HTTP headers for remote modules.
*   **Environment-Specific Type Checking**: Deno supports type checking for different environments (browsers, web workers, or combined SSR environments) by configuring `compilerOptions.lib` in `deno.json` or using `/// <reference lib="..." />` comments.

### Web Development
Deno offers a secure and developer-friendly environment for web applications:
*   **HTTP Server**: The `Deno.serve` API is the recommended way to write HTTP servers.
*   **Frameworks**: Deno supports popular web frameworks like **Next.js**, **Fresh** (Deno's popular framework emphasizing no JavaScript to clients by default), **Astro**, **Vite**, **Lume**, **Docusaurus**, **Hono**, and **Oak**.
*   **JSX Support**: Deno has built-in support for JSX in `.jsx` and `.tsx` files, useful for server-side rendering. The recommended approach uses the JSX automatic runtime (`"jsx": "react-jsx"` and `"jsxImportSource"` in `deno.json`). A new "precompile" transform optimizes JSX for server-side rendering, offering significant performance gains with Preact or Hono.

### Workspaces and Monorepos
Deno supports **workspaces (monorepos)** to manage multiple related and interdependent packages within a single repository.
*   **Workspace Definition**: The root `deno.json` defines workspace members using path patterns.
*   **Dependency Resolution**: Workspace members can be referenced using "bare specifiers" (e.g., `@scope/add`), with package names defined in their `deno.json` files. Dependencies specified in the root `imports` are inherited by all workspace members.
*   **Tooling Integration**: Built-in Deno tools like `deno test`, `deno fmt`, and `deno lint` can run across all workspace members, respecting individual package configurations.
*   **Interdependencies**: Workspace members can depend on each other, allowing for modular architecture and shared code without publishing to a registry.
*   **npm/pnpm Compatibility**: Deno works seamlessly with standard npm workspaces (defined in `package.json`) and supports pnpm workspace configurations, though `pnpm-workspace.yaml` files need conversion to `deno.json`.

In summary, Deno provides a modern, secure, and developer-friendly runtime with a powerful CLI, comprehensive debugging and testing tools, robust dependency management, and strong compatibility with both web standards and the Node.js/npm ecosystem.
