/**
 * Enable/disable the built-in node packs that ship with NodeTool.
 *
 * Packs are opt-in: only those marked `defaultEnabled` (or `required`) in the
 * catalog load on a fresh install. The user's explicit choices are persisted
 * as `enabledBuiltins` / `disabledBuiltins` in the packs config file the
 * backend already reads at bootstrap (`~/.config/nodetool/packs.json`,
 * override via `NODETOOL_PACKS_CONFIG`). Changes apply on the next server
 * start, so callers should prompt for a restart after toggling.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  BUILTIN_NODE_PACKS,
  resolveBuiltinPackEnabled,
} from "@nodetool-ai/protocol/builtin-packs";
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

function idList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Explicit user overrides keyed by pack id; absent packs keep their default. */
function readOverrides(): Record<string, boolean> {
  const config = readPacksConfig();
  const overrides: Record<string, boolean> = {};
  for (const id of idList(config.disabledBuiltins)) overrides[id] = false;
  for (const id of idList(config.enabledBuiltins)) overrides[id] = true;
  return overrides;
}

function writeOverrides(overrides: Record<string, boolean>): void {
  const path = packsConfigPath();
  const config = {
    ...readPacksConfig(),
    enabledBuiltins: Object.keys(overrides)
      .filter((id) => overrides[id])
      .sort(),
    disabledBuiltins: Object.keys(overrides)
      .filter((id) => !overrides[id])
      .sort(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** All built-in packs with their current enabled state. */
export function listBuiltinPacks(): BuiltinPackStatus[] {
  const overrides = readOverrides();
  return BUILTIN_NODE_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    required: pack.required ?? false,
    enabled: resolveBuiltinPackEnabled(pack, overrides[pack.id]),
  }));
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
  writeOverrides({ ...readOverrides(), [id]: enabled });
  return listBuiltinPacks();
}
