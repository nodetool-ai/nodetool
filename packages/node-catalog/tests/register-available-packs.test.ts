import { describe, expect, it } from "vitest";
import { NodeRegistry, type BuiltinPackPolicy } from "@nodetool-ai/node-sdk";
import { registerBuiltinPacks, CLI_BUILTIN_PACK_POLICY } from "@nodetool-ai/base-nodes/builtin-packs";
import { registerAvailablePacks } from "../src/register-available-packs.js";

it.each([
  ["CLI", CLI_BUILTIN_PACK_POLICY],
  ["local", {}],
  ["local overrides", { enabledOverrides: { elevenlabs: true, fal: false, kie: false } }]
] satisfies Array<[string, BuiltinPackPolicy]>)("%s registration preserves bundled types and per-type metadata", async (_name, policy) => {
  const bundled = new NodeRegistry();
  const available = new NodeRegistry();
  registerBuiltinPacks(bundled, policy);
  await registerAvailablePacks(available, policy);
  expect(available.list().sort()).toEqual(bundled.list().sort());
  expect(available.listMetadata().sort((a, b) => a.node_type.localeCompare(b.node_type))).toEqual(
    bundled.listMetadata().sort((a, b) => a.node_type.localeCompare(b.node_type))
  );
});
