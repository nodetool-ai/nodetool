/**
 * Enable/disable the built-in node packs that ship with NodeTool.
 *
 * The user's choices are persisted as `disabledBuiltins` in the packs config
 * file the backend already reads at bootstrap
 * (`~/.config/nodetool/packs.json`, override via `NODETOOL_PACKS_CONFIG`).
 * The server skips disabled packs on its next start, so callers should
 * prompt for a server restart after toggling.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol/builtin-packs";
import type { BuiltinPackStatus } from "./types.d";

/** Must match the path used by `@nodetool-ai/node-sdk`'s pack loader. */
function packsConfigPath(): string {
  return (
    process.env.NODETOOL_PACKS_CONFIG ??
    join(homedir(), ".config", "nodetool", "packs.json")
  );
}

function readPacksConfig(): Record<string, unknown> {
  const path = packsConfigPath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readDisabledBuiltins(): Set<string> {
  const raw = readPacksConfig().disabledBuiltins;
  return new Set(
    Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
  );
}

function writeDisabledBuiltins(ids: Set<string>): void {
  const path = packsConfigPath();
  const config = { ...readPacksConfig(), disabledBuiltins: [...ids].sort() };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** All built-in packs with their current enabled state. */
export function listBuiltinPacks(): BuiltinPackStatus[] {
  const disabled = readDisabledBuiltins();
  return BUILTIN_NODE_PACKS.map((pack) => {
    const required = pack.required ?? false;
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      required,
      enabled: required || !disabled.has(pack.id),
    };
  });
}

/**
 * Persist a pack's enabled state and return the refreshed list. Throws on an
 * unknown pack id or an attempt to disable a required pack.
 */
export function setBuiltinPackEnabled(
  id: string,
  enabled: boolean,
): BuiltinPackStatus[] {
  const pack = BUILTIN_NODE_PACKS.find((p) => p.id === id);
  if (!pack) {
    throw new Error(`Unknown built-in pack "${id}"`);
  }
  if (pack.required && !enabled) {
    throw new Error(`Built-in pack "${id}" cannot be disabled`);
  }
  const disabled = readDisabledBuiltins();
  if (enabled) {
    disabled.delete(id);
  } else {
    disabled.add(id);
  }
  writeDisabledBuiltins(disabled);
  return listBuiltinPacks();
}
