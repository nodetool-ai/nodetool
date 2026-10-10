import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formKey } from "../src/forms.js";
import type { FormResult } from "../src/model.js";
import { SnapshotStore, snapshotPath } from "../src/snapshot.js";
import { project } from "./fixture.js";

const form = (file: string, id: string): FormResult => ({
  id,
  namespace: "ns",
  name: id.split("/")[1],
  private: false,
  file,
  line: 1,
  endLine: 2,
  digest: `hash-${id}`,
  killed: 1,
  survived: 0,
  uncovered: 0,
  sites: 1
});

describe("SnapshotStore", () => {
  it("keeps another file's forms in a shared namespace and reloads history", () => {
    const root = project({});
    const store = new SnapshotStore(root);
    const a = JSON.stringify(["a.ts", "ns", "defn/f", 1, 2, "+", "-"]);
    const b = JSON.stringify(["b.ts", "ns", "defn/g", 1, 2, "+", "-"]);
    store.write("a.ts", [form("a.ts", "defn/f")], new Map([[a, "killed"]]));
    store.write("b.ts", [form("b.ts", "defn/g")], new Map([[b, "survived"]]));
    store.write("a.ts", [form("a.ts", "defn/f")], new Map([[a, "survived"]]));

    const written = JSON.parse(readFileSync(join(root, ".metrics/mutate/ns.json"), "utf8"));
    expect(written.forms.map((entry: { id: string }) => entry.id).sort()).toEqual(["defn/f", "defn/g"]);
    expect(written.outcomes).toEqual({ [a]: "survived", [b]: "survived" });

    const history = new SnapshotStore(root).history("a.ts", formKey);
    expect(history.forms.get(formKey("ns", "defn/f"))).toBe("hash-defn/f");
    expect([...history.outcomes]).toEqual([[a, "survived"]]);
  });

  it("writes to a separate metrics directory", () => {
    const root = project({});
    new SnapshotStore(root, "out/crash").write("a.ts", [form("a.ts", "defn/f")], new Map());
    expect(JSON.parse(readFileSync(join(root, "out/crash/ns.json"), "utf8")).namespace).toBe("ns");
  });

  it("rejects a namespace that would escape the snapshot directory", () => {
    expect(() => snapshotPath("/r/.metrics/mutate", "a/../b")).toThrow("unsafe namespace");
    expect(snapshotPath("/r/.metrics/mutate", "pkg.mod.Class")).toBe("/r/.metrics/mutate/pkg.mod.Class.json");
  });
});
