/**
 * The kernel runner every server-side app simulation uses. It moved to
 * `@nodetool-ai/execution/service`; this module is the server's import site.
 */
export { createAppServerRunner } from "@nodetool-ai/execution/service";
export type { AppServerRunnerOptions } from "@nodetool-ai/execution/service";
