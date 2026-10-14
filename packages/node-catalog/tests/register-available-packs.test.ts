import { describe, expect, it } from "vitest";
import { NodeRegistry, type BuiltinPackPolicy } from "@nodetool-ai/node-sdk";
import { registerBuiltinPacks, CLI_BUILTIN_PACK_POLICY } from "@nodetool-ai/base-nodes/builtin-packs";
import { catalogPackIdsForBuiltin, registerAvailablePacks, registerCatalogPack } from "../src/register-available-packs.js";

it("maps legacy base policy to domain packs and rejects unknown ids", () => {
  expect(catalogPackIdsForBuiltin("base")).toEqual([
    "core", "text", "llm", "code", "data", "document", "image", "audio", "video",
    "integration", "automation", "game", "blender", "manimgx"
  ]);
  expect(catalogPackIdsForBuiltin("fal")).toEqual(["fal"]);
  expect(() => catalogPackIdsForBuiltin("unknown")).toThrow("Unknown built-in node pack");
});

it("registers one available pack without bootstrapping other packs", async () => {
  const registry = new NodeRegistry();
  await registerCatalogPack(registry, "text");
  expect(registry.list().length).toBeGreaterThan(0);
  expect(registry.list().every((type) => registry.getNodePackageId(type) === "text")).toBe(true);
  await expect(registerCatalogPack(registry, "unknown")).rejects.toThrow("Unknown node pack");
});

// Registration imports built media packs under CI load.
const PACK_REGISTRATION_TIMEOUT_MS = 35_000;

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
}, PACK_REGISTRATION_TIMEOUT_MS);
