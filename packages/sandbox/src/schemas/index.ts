/**
 * Shared Zod schemas for the sandbox tool surface.
 *
 * Imported by:
 *   - host (@nodetool-ai/sandbox) — to validate client requests and describe
 *     tools to LLMs
 *   - in-container (@nodetool-ai/sandbox-agent) — to validate Fastify routes
 *
 * Single source of truth means no schema drift between host and container.
 */

export * from "./file.js";
export * from "./shell.js";
export * from "./browser.js";
export * from "./desktop.js";
export * from "./search.js";
export * from "./message.js";
export * from "./deploy.js";
export * from "./health.js";
