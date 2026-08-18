/**
 * The `settings` capability module.
 *
 * Two claims are worth testing, and only one of them is about settings.
 *
 * The first is the split: a secret and an ordinary setting live in one catalog,
 * and every read and write path has to tell them apart. `get_setting` on
 * `OPENAI_API_KEY` must refuse even though the value sits in `process.env`
 * where the non-secret path would happily find it, and `set_setting` must
 * refuse rather than write a credential into the settings table.
 *
 * The second is the dialog. `request_secret` carries no value in either
 * direction, and a run with no client refuses instead of falling back — so the
 * tests assert that the value never appears in the request the host receives,
 * and that a headless run is a named refusal rather than a silent write.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Secret, Setting, initTestDb } from "@nodetool-ai/models";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import {
  SETTINGS_CAPABILITIES,
  module as settingsModule
} from "../src/capabilities/settings.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  listCapabilityModules,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type {
  CapabilityRun,
  SecretPrompt,
  SecretPromptRequest
} from "../src/capabilities/types.js";

const USER = "user-settings";
const ctx = { userId: USER } as unknown as ProcessingContext;

function runWith(secretPrompt?: SecretPrompt): CapabilityRun {
  return createCapabilityRun(
    secretPrompt === undefined
      ? { context: ctx, gate: UNGATED }
      : { context: ctx, gate: UNGATED, secretPrompt }
  );
}

async function call(
  name: string,
  args: Record<string, unknown>,
  run: CapabilityRun = runWith()
): Promise<Record<string, unknown>> {
  const entry = SETTINGS_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no settings capability named "${name}"`);
  return (await entry.impl(run, args)) as Record<string, unknown>;
}

// Storing a secret encrypts it. Without this the store reaches for the OS
// keychain, which a headless test box does not have.
process.env["SECRETS_MASTER_KEY"] = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz";

const savedEnv = { ...process.env };


beforeEach(() => {
  initTestDb();
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("settings capability module", () => {
  it("is registered, declared, and drift-clean", async () => {
    expect(listCapabilityModules()).toContain("settings");
    const loaded = await loadCapabilityModule("settings");
    expect(loaded).toBe(settingsModule);
    expect(capabilityModuleIssues("settings", loaded)).toEqual([]);
  });

  it("is importable by the guest under its own specifier", () => {
    expect(sandboxCapabilitySpecifier("settings")).toBe(
      "@nodetool-ai/sandbox-nodetool/settings"
    );
  });

  it("classifies reads as read and the two acting calls above it", () => {
    expect(permissionCategoryFor("list_settings")).toBe("read");
    expect(permissionCategoryFor("get_setting")).toBe("read");
    expect(permissionCategoryFor("list_secrets")).toBe("read");
    // Unlisted in the legacy map on purpose — the gate's conservative default.
    expect(permissionCategoryFor("set_setting")).toBe("external");
    expect(permissionCategoryFor("request_secret")).toBe("external");
  });
});

describe("reading settings", () => {
  it("lists declared non-secret settings and never a secret", async () => {
    const result = await call("list_settings", {});
    const keys = (result.settings as { key: string }[]).map((s) => s.key);
    expect(keys).toContain("AUTOSAVE_ENABLED");
    expect(keys).not.toContain("OPENAI_API_KEY");
  });

  it("filters by group", async () => {
    const result = await call("list_settings", { group: "autosave" });
    const groups = new Set(
      (result.settings as { group: string }[]).map((s) => s.group)
    );
    expect([...groups]).toEqual(["Autosave"]);
  });

  it("resolves a saved value over the environment, and reports which", async () => {
    process.env.AUTOSAVE_INTERVAL_MINUTES = "5";
    expect(await call("get_setting", { key: "AUTOSAVE_INTERVAL_MINUTES" }))
      .toMatchObject({ value: "5", source: "env" });

    await Setting.upsert({
      userId: USER,
      key: "AUTOSAVE_INTERVAL_MINUTES",
      value: "9"
    });
    expect(await call("get_setting", { key: "AUTOSAVE_INTERVAL_MINUTES" }))
      .toMatchObject({ value: "9", source: "user" });
  });

  it("refuses a secret even when the environment holds one", async () => {
    process.env.OPENAI_API_KEY = "sk-must-not-leak";
    const result = await call("get_setting", { key: "OPENAI_API_KEY" });
    expect(result.error_kind).toBe("is_secret");
    expect(JSON.stringify(result)).not.toContain("sk-must-not-leak");
  });

  it("names near-misses for a key nothing declares", async () => {
    const result = await call("get_setting", { key: "AUTOSAVE_ENABLE" });
    expect(result.error_kind).toBe("unknown_setting");
    expect(result.error).toContain("AUTOSAVE_ENABLED");
  });
});

describe("writing settings", () => {
  it("writes a declared setting for this user", async () => {
    expect(
      await call("set_setting", { key: "AUTOSAVE_ENABLED", value: "false" })
    ).toMatchObject({ ok: true });
    const row = await Setting.find(USER, "AUTOSAVE_ENABLED");
    expect(row?.value).toBe("false");
  });

  it("refuses a value outside a declared enum", async () => {
    const result = await call("set_setting", {
      key: "AUTOSAVE_ENABLED",
      value: "maybe"
    });
    expect(result.error_kind).toBe("invalid_value");
    expect(await Setting.find(USER, "AUTOSAVE_ENABLED")).toBeFalsy();
  });

  it("refuses to write a secret and points at request_secret", async () => {
    const result = await call("set_setting", {
      key: "OPENAI_API_KEY",
      value: "sk-must-not-leak"
    });
    expect(result.error_kind).toBe("is_secret");
    expect(result.error).toContain("request_secret");
    expect(await Setting.find(USER, "OPENAI_API_KEY")).toBeFalsy();
  });

  it("refuses an undeclared key", async () => {
    const result = await call("set_setting", {
      key: "NOT_A_SETTING",
      value: "x"
    });
    expect(result.error_kind).toBe("unknown_setting");
  });
});

describe("listing secrets", () => {
  it("reports configured state without values", async () => {
    await Secret.upsert({
      userId: USER,
      key: "OPENAI_API_KEY",
      value: "sk-must-not-leak"
    });
    const result = await call("list_secrets", {});
    const secrets = result.secrets as { key: string; configured: boolean }[];
    const openai = secrets.find((s) => s.key === "OPENAI_API_KEY");
    expect(openai?.configured).toBe(true);
    expect(secrets.some((s) => s.configured === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sk-must-not-leak");
  });

  it("includes a stored credential NodeTool does not declare", async () => {
    await Secret.upsert({ userId: USER, key: "MY_OWN_KEY", value: "v" });
    const secrets = (await call("list_secrets", {})).secrets as {
      key: string;
    }[];
    expect(secrets.map((s) => s.key)).toContain("MY_OWN_KEY");
  });
});

describe("request_secret", () => {
  it("refuses by name when the run has no dialog to show", async () => {
    const result = await call("request_secret", { key: "STRIPE_API_KEY" });
    expect(result.error_kind).toBe("no_dialog");
    expect(result.error).toContain("STRIPE_API_KEY");
  });

  it("asks with a name and a reason, and carries no value either way", async () => {
    let asked: SecretPromptRequest | undefined;
    const run = runWith(async (request) => {
      asked = request;
      return "saved";
    });
    const result = await call(
      "request_secret",
      {
        key: "OPENAI_API_KEY",
        reason: "to draft the summary",
        help_url: "https://platform.openai.com/api-keys"
      },
      run
    );

    expect(asked).toMatchObject({
      key: "OPENAI_API_KEY",
      reason: "to draft the summary",
      helpUrl: "https://platform.openai.com/api-keys"
    });
    // The catalog's own description rides along so the dialog can explain
    // itself without the model writing the copy.
    expect(asked?.description).toBeTruthy();
    // There is no field for a value, in the ask or in the answer.
    expect(Object.keys(asked ?? {})).not.toContain("value");
    expect(result).toMatchObject({ ok: true, configured: true });
    expect(Object.keys(result)).not.toContain("value");
  });

  it("reports a decline as a refusal the model can act on", async () => {
    const run = runWith(async () => "declined");
    const result = await call("request_secret", { key: "STRIPE_API_KEY" }, run);
    expect(result.error_kind).toBe("declined");
    expect(result.ok).toBe(false);
  });
});
