/**
 * The `settings` capability module — NodeTool's own configuration, reachable
 * from sandboxed code as `@nodetool-ai/sandbox-nodetool/settings`.
 *
 * The catalog it reads is `@nodetool-ai/config`'s `settingCatalog()`, the same
 * table the tRPC settings router answers `settings.list` from. That shared
 * table is what makes the secret/non-secret split trustworthy here: a
 * capability that decided whether `OPENAI_API_KEY` holds a credential by
 * looking at the name would eventually be wrong, and being wrong once means a
 * key in a model's context.
 *
 * ## Secrets are asked for, never set
 *
 * `set_setting` refuses a secret and there is no `set_secret`. The only path
 * from guest code to a stored credential is {@link requestSecret}, which takes
 * a *name and a reason* and no value: it opens a dialog in the user's client,
 * they type the key there, and the client saves it over its own authenticated
 * tRPC call. The value never enters the guest, the model's context, the chat
 * transcript, or this process.
 *
 * The dialog is a host capability, not a fallback. A run that carries no
 * `CapabilityRun.secretPrompt` — every headless run: a workflow on the
 * kernel, the CLI, an eval — is refused by name rather than quietly writing
 * something the user never saw.
 *
 * Reading a secret is unchanged and lives elsewhere: `nodetool.secrets.get`,
 * bound by the run's declared `secretScope` at the sandbox bridge.
 */

import {
  settingCatalog,
  settingDefinition,
  type SettingCatalogEntry
} from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { userIdOf } from "../tools/mcp-tool-support.js";
import type {
  CapabilityExport,
  CapabilityModule,
  SecretPromptRequest
} from "./types.js";
import {
  getSettingSpec,
  listSecretsSpec,
  listSettingsSpec,
  requestSecretSpec,
  setSettingSpec
} from "./settings.specs.js";
import { isNonEmptyString, isString } from "../utils/type-guards.js";

export {
  GET_SETTING_TOOL_NAME,
  LIST_SECRETS_TOOL_NAME,
  LIST_SETTINGS_TOOL_NAME,
  REQUEST_SECRET_TOOL_NAME,
  SET_SETTING_TOOL_NAME
} from "./settings.specs.js";

/** One setting as the guest sees it. A secret never reaches this shape. */
export interface SettingView {
  key: string;
  group: string;
  description: string;
  allowed_values: string[] | null;
  value: string | null;
  source: "user" | "env" | "unset";
}

/** One credential as the guest sees it: whether it exists, never what it is. */
export interface SecretView {
  key: string;
  group: string;
  description: string;
  configured: boolean;
}

/** Every refusal these capabilities return, classified so a model can act. */
type ErrorKind =
  | "unknown_setting"
  | "is_secret"
  | "invalid_value"
  | "no_dialog"
  | "declined";

function refuse(kind: ErrorKind, message: string): Record<string, unknown> {
  return { ok: false, error: message, error_kind: kind };
}

/**
 * A name the catalog does not declare. The near-misses matter more than the
 * refusal: a model that misspelled a key can fix the call from the answer.
 */
function unknownSetting(key: string): Record<string, unknown> {
  const near = settingCatalog()
    .filter(
      (def) =>
        def.envVar.includes(key.toUpperCase()) ||
        key.toUpperCase().includes(def.envVar)
    )
    .map((def) => def.envVar)
    .slice(0, 10);
  return refuse(
    "unknown_setting",
    `NodeTool declares no setting named "${key}".` +
      (near.length === 0
        ? " Call list_settings to see what it does declare."
        : ` Did you mean: ${near.join(", ")}?`)
  );
}

/**
 * Resolve one setting the way the server does: this user's saved value, then
 * the process environment, then unset. The `Setting` model is imported lazily
 * so the eager spec table never pulls the database in.
 */
async function resolveValue(
  context: ProcessingContext,
  envVar: string
): Promise<{ value: string | null; source: SettingView["source"] }> {
  const { Setting } = await import("@nodetool-ai/models");
  const saved = await Setting.find(userIdOf(context), envVar);
  if (saved && saved.value.length > 0) {
    return { value: saved.value, source: "user" };
  }
  const fromEnv = process.env[envVar];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return { value: fromEnv, source: "env" };
  }
  return { value: null, source: "unset" };
}

async function viewOf(
  context: ProcessingContext,
  def: SettingCatalogEntry
): Promise<SettingView> {
  const { value, source } = await resolveValue(context, def.envVar);
  return {
    key: def.envVar,
    group: def.group,
    description: def.description,
    allowed_values: def.enum ?? null,
    value,
    source
  };
}

const listSettings: CapabilityExport = {
  spec: listSettingsSpec,
  impl: async (run, params) => {
    const group = params["group"];
    const wanted = settingCatalog().filter(
      (def) =>
        def.isSecret !== true &&
        (!isNonEmptyString(group) ||
          def.group.toLowerCase() === group.toLowerCase())
    );
    const settings = await Promise.all(
      wanted.map((def) => viewOf(run.context, def))
    );
    return { settings, groups: [...new Set(settings.map((s) => s.group))] };
  }
};

const getSetting: CapabilityExport = {
  spec: getSettingSpec,
  impl: async (run, params) => {
    const key = params["key"];
    if (!isNonEmptyString(key)) {
      return refuse("unknown_setting", "Pass the setting's name as `key`.");
    }
    const def = settingDefinition(key);
    if (def === undefined) return unknownSetting(key);
    if (def.isSecret === true) {
      return refuse(
        "is_secret",
        `${key} holds a credential, so its value is not readable here. Read it with ` +
          "nodetool.secrets.get, which works only if this run declares the name in its secret scope."
      );
    }
    return viewOf(run.context, def);
  }
};

const setSetting: CapabilityExport = {
  spec: setSettingSpec,
  impl: async (run, params) => {
    const key = params["key"];
    const value = params["value"];
    if (!isNonEmptyString(key)) {
      return refuse("unknown_setting", "Pass the setting's name as `key`.");
    }
    if (!isString(value)) {
      return refuse("invalid_value", "Pass the new value as a string in `value`.");
    }
    const def = settingDefinition(key);
    if (def === undefined) return unknownSetting(key);
    if (def.isSecret === true) {
      return refuse(
        "is_secret",
        `${key} holds a credential and cannot be set from code. Call request_secret to ask ` +
          "the user to enter it themselves."
      );
    }
    if (def.enum !== undefined && !def.enum.includes(value)) {
      return refuse(
        "invalid_value",
        `${key} accepts only: ${def.enum.join(", ")}.`
      );
    }
    const { Setting } = await import("@nodetool-ai/models");
    await Setting.upsert({ userId: userIdOf(run.context), key, value });
    return { ok: true, key, value };
  }
};

const listSecrets: CapabilityExport = {
  spec: listSecretsSpec,
  impl: async (run) => {
    const declared = settingCatalog().filter((def) => def.isSecret === true);
    const { Secret } = await import("@nodetool-ai/models");
    const [stored] = await Secret.listForUser(userIdOf(run.context), 1000);
    const storedKeys = new Set(stored.map((row) => row.key));
    const secrets: SecretView[] = declared.map((def) => ({
      key: def.envVar,
      group: def.group,
      description: def.description,
      configured:
        storedKeys.has(def.envVar) || Boolean(process.env[def.envVar])
    }));
    // A credential stored under a name NodeTool does not ship — a user's own,
    // or one a previous request_secret created. It is configured by
    // definition, and hiding it would have code ask for what already exists.
    for (const key of storedKeys) {
      if (!declared.some((def) => def.envVar === key)) {
        secrets.push({
          key,
          group: "Custom",
          description: "",
          configured: true
        });
      }
    }
    return { secrets };
  }
};

/**
 * Ask the user for a credential.
 *
 * Everything this returns is a fact about the store, never about the value:
 * `saved` means one now exists under that name.
 */
const requestSecret: CapabilityExport = {
  spec: requestSecretSpec,
  impl: async (run, params) => {
    const key = params["key"];
    if (!isNonEmptyString(key)) {
      return refuse("unknown_setting", "Pass the secret's name as `key`.");
    }
    const prompt = run.secretPrompt;
    if (prompt === undefined) {
      return refuse(
        "no_dialog",
        "This run has no interactive client, so there is nowhere to show the entry dialog. " +
          `A secret is only ever set by the user: ask them to add ${key} under Settings > API Keys.`
      );
    }
    const declared = settingDefinition(key);
    const request: SecretPromptRequest = { key };
    if (declared?.description !== undefined) {
      Object.assign(request, { description: declared.description });
    }
    if (isNonEmptyString(params["reason"])) {
      Object.assign(request, { reason: params["reason"] });
    }
    if (isNonEmptyString(params["help_url"])) {
      Object.assign(request, { helpUrl: params["help_url"] });
    }

    // The user's wait is not the guest program's. Charged to a code action's
    // wall clock, the time spent finding an API key kills the very program
    // that asked for it — the same reason the permission gate suspends.
    const resume = run.gate.clock?.suspend();
    let status: "saved" | "declined";
    try {
      status = await prompt(request);
    } finally {
      resume?.();
    }

    if (status !== "saved") {
      return refuse(
        "declined",
        `The user did not enter ${key}. Do not ask again in this run — continue without it, ` +
          "or tell them what cannot be done."
      );
    }
    return {
      ok: true,
      key,
      configured: true,
      note:
        "The value was saved directly by the user and is not readable here. Read it with " +
        "nodetool.secrets.get if this run declares the name in its secret scope."
    };
  }
};

export const SETTINGS_CAPABILITIES: readonly CapabilityExport[] = [
  listSettings,
  getSetting,
  setSetting,
  listSecrets,
  requestSecret
];

export const module: CapabilityModule = {
  module: "settings",
  exports: SETTINGS_CAPABILITIES
};
