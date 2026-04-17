import { z } from "zod";

// ── Target constants ──────────────────────────────────────────────
// The server enumerates three hard-coded MCP targets (Claude Code, Codex,
// OpenCode). Clients can filter by a subset, but unknown targets are
// silently dropped by the router — matching legacy `resolveTargets` behaviour.
export const mcpTarget = z.enum(["claude", "codex", "opencode"]);
export type McpTarget = z.infer<typeof mcpTarget>;

// ── status (GET /api/mcp/status) ──────────────────────────────────
export const targetStatus = z.object({
  target: mcpTarget,
  label: z.string(),
  installed: z.boolean(),
  url: z.string().nullable(),
  configPath: z.string().nullable()
});
export type TargetStatus = z.infer<typeof targetStatus>;

export const statusOutput = z.object({
  targets: z.array(targetStatus),
  defaultUrl: z.string()
});
export type StatusOutput = z.infer<typeof statusOutput>;

// ── install (POST /api/mcp/install) ───────────────────────────────
// Empty `targets` array means "all targets" — matches legacy `resolveTargets`.
export const installInput = z.object({
  targets: z.array(mcpTarget).optional(),
  url: z.string().optional()
});
export type InstallInput = z.infer<typeof installInput>;

// Each result element has either success=true+configPath OR success=false+error.
// We use a discriminated union so the client gets narrowing.
export const installResult = z.object({
  target: mcpTarget,
  label: z.string(),
  success: z.boolean(),
  configPath: z.string().optional(),
  error: z.string().optional()
});
export type InstallResult = z.infer<typeof installResult>;

export const installOutput = z.object({
  results: z.array(installResult),
  url: z.string()
});
export type InstallOutput = z.infer<typeof installOutput>;

// ── uninstall (POST /api/mcp/uninstall) ───────────────────────────
export const uninstallInput = z.object({
  targets: z.array(mcpTarget).optional()
});
export type UninstallInput = z.infer<typeof uninstallInput>;

export const uninstallResult = z.object({
  target: mcpTarget,
  label: z.string(),
  removed: z.boolean(),
  error: z.string().optional()
});
export type UninstallResult = z.infer<typeof uninstallResult>;

export const uninstallOutput = z.object({
  results: z.array(uninstallResult)
});
export type UninstallOutput = z.infer<typeof uninstallOutput>;
