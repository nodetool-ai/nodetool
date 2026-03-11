import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import {
  registerBaseNodes,
  GenerateUUID1Node,
  GenerateUUID3Node,
  GenerateUUID4Node,
  GenerateUUID5Node,
  ParseUUIDNode,
  FormatUUIDNode,
  IsValidUUIDNode,
} from "../src/index.js";

function uuidVersion(value: string): number {
  return Number.parseInt(value[14], 16);
}

describe("uuid nodes", () => {
  it("registers legacy lib.uuid node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.uuid.GenerateUUID1")).toBe(true);
    expect(registry.has("lib.uuid.GenerateUUID3")).toBe(true);
    expect(registry.has("lib.uuid.GenerateUUID4")).toBe(true);
    expect(registry.has("lib.uuid.GenerateUUID5")).toBe(true);
    expect(registry.has("lib.uuid.ParseUUID")).toBe(true);
    expect(registry.has("lib.uuid.FormatUUID")).toBe(true);
    expect(registry.has("lib.uuid.IsValidUUID")).toBe(true);
  });

  it("generates uuid v4 and uuid v1", async () => {
    const v4a = String((await new GenerateUUID4Node().process({})).output);
    const v4b = String((await new GenerateUUID4Node().process({})).output);
    const v1 = String((await new GenerateUUID1Node().process({})).output);

    expect(v4a).not.toBe(v4b);
    expect(uuidVersion(v4a)).toBe(4);
    expect(uuidVersion(v1)).toBe(1);
  });

  it("generates deterministic uuid v3 and v5", async () => {
    const input = { namespace: "dns", name: "example.com" };
    const v3a = String((await new GenerateUUID3Node().process(input)).output);
    const v3b = String((await new GenerateUUID3Node().process(input)).output);
    const v5a = String((await new GenerateUUID5Node().process(input)).output);
    const v5b = String((await new GenerateUUID5Node().process(input)).output);

    expect(v3a).toBe(v3b);
    expect(v5a).toBe(v5b);
    expect(v3a).not.toBe(v5a);
    expect(uuidVersion(v3a)).toBe(3);
    expect(uuidVersion(v5a)).toBe(5);
  });

  it("supports alternate namespaces and rejects invalid ones", async () => {
    for (const namespace of ["dns", "url", "oid", "x500"]) {
      const v3 = String((await new GenerateUUID3Node().process({ namespace, name: "test" })).output);
      const v5 = String((await new GenerateUUID5Node().process({ namespace, name: "test" })).output);
      expect(uuidVersion(v3)).toBe(3);
      expect(uuidVersion(v5)).toBe(5);
    }

    await expect(
      new GenerateUUID3Node().process({ namespace: "invalid", name: "test" })
    ).rejects.toThrow("Invalid namespace");
    await expect(
      new GenerateUUID5Node().process({ namespace: "invalid", name: "test" })
    ).rejects.toThrow("Invalid namespace");
  });

  it("parses uuid and reports invalid values", async () => {
    const generated = String((await new GenerateUUID4Node().process({})).output);
    const parsed = await new ParseUUIDNode().process({ uuid_string: generated });
    const invalid = await new ParseUUIDNode().process({ uuid_string: "not-a-uuid" });

    expect(parsed.output).toMatchObject({
      uuid: generated,
      version: 4,
      is_valid: true,
    });
    expect(invalid.output).toMatchObject({
      uuid: "not-a-uuid",
      is_valid: false,
    });
  });

  it("formats uuid output variants and validates strings", async () => {
    const generated = String((await new GenerateUUID4Node().process({})).output);

    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "standard" })
    ).resolves.toEqual({ output: generated });
    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "hex" })
    ).resolves.toMatchObject({ output: generated.replaceAll("-", "") });
    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "urn" })
    ).resolves.toMatchObject({ output: `urn:uuid:${generated}` });
    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "int" })
    ).resolves.toMatchObject({ output: expect.any(String) });
    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "bytes_hex" })
    ).resolves.toMatchObject({ output: generated.replaceAll("-", "") });
    await expect(
      new FormatUUIDNode().process({ uuid_string: generated, format: "nope" })
    ).rejects.toThrow("Unsupported format");

    await expect(
      new IsValidUUIDNode().process({ uuid_string: generated })
    ).resolves.toEqual({ output: true });
    await expect(
      new IsValidUUIDNode().process({ uuid_string: "not-a-uuid" })
    ).resolves.toEqual({ output: false });
  });
});
