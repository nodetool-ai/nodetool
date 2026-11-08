import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error The generator is a plain ES module without declarations.
import { OUTPUT, SOURCE, nodeContextMembers, renderMembers } from "../scripts/node-context-members.mjs";

interface Member {
  name: string;
  group: string;
  kind: string;
}

describe("node-context-members.json", () => {
  it("matches the NodeContext interface", () => {
    expect(readFileSync(OUTPUT, "utf8")).toBe(renderMembers());
  });

  it("reads members from every interface NodeContext extends", () => {
    const members: Member[] = nodeContextMembers();
    expect(members.length).toBeGreaterThan(0);
    expect(new Set(members.map((member) => member.group)).size).toBeGreaterThan(1);
    expect(members.every((member) => member.kind === "method" || member.kind === "property")).toBe(true);
  });

  it("changes when a member is removed from the interface", () => {
    const source: string = readFileSync(SOURCE, "utf8");
    const line = source.split("\n").find((text) => /^\s+readonly \w+: \(.*\) => .*;$/.test(text));
    expect(line).toBeDefined();
    const edited = source.replace(`${line}\n`, "");
    const before: Member[] = nodeContextMembers(source);
    const after: Member[] = nodeContextMembers(edited);
    expect(after).toHaveLength(before.length - 1);
  });
});
