/**
 * `validateJsScriptDoc`'s `packDtsSources` option: type-checks a script's
 * imports against an installed sandbox pack's own shipped `.d.ts`. Red on a
 * body that gets a documented option's shape wrong
 * (`@nodetool-ai/sandbox-timeline`'s `typewriter({caret})` — `caret` is an
 * object, not a boolean), green on the same call written correctly, and
 * green on a plain body when no pack types are given at all (the default —
 * this check is additive, never required).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { validateJsScriptDoc } from "../src/js-script-debug/index.js";

const TIMELINE_DTS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "sandbox-packs",
  "sandbox-timeline",
  "sandbox",
  "index.d.ts"
);
const packDtsSources = new Map([["@nodetool-ai/sandbox-timeline", TIMELINE_DTS]]);

const doc = (code: string): JsScriptDocument => ({
  ...emptyJsScriptDocument(),
  description: "Types a timeline body.",
  code,
  outputs: [{ name: "ok", type: "bool" }]
});

const codes = (validation: {
  errors: { code: string; message: string }[];
}): string[] => validation.errors.map((issue) => issue.code);

describe("validateJsScriptDoc packDtsSources", () => {
  it("fails naming caret when typewriter's caret option is the wrong shape", async () => {
    const validation = await validateJsScriptDoc(
      doc(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.scene("s", 1, (s) => {
  const t = s.text("hi");
  t.typewriter({ caret: true });
});
await output("ok", true);
`),
      { packDtsSources }
    );
    expect(validation.ok).toBe(false);
    expect(codes(validation)).toContain("js_script_type_error");
    const message = validation.errors
      .filter((issue) => issue.code === "js_script_type_error")
      .map((issue) => issue.message)
      .join("\n");
    expect(message.toLowerCase()).toContain("caret");
  });

  it("passes the same call once caret is an object", async () => {
    const validation = await validateJsScriptDoc(
      doc(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.scene("s", 1, (s) => {
  const t = s.text("hi");
  t.typewriter({ caret: { color: "#ffffff" } });
});
await output("ok", true);
`),
      { packDtsSources }
    );
    expect(codes(validation)).not.toContain("js_script_type_error");
  });

  it("fails naming align when stack()'s align is not one of its literal union", async () => {
    const validation = await validateJsScriptDoc(
      doc(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.scene("s", 1, (s) => {
  s.stack([s.text("a")], { align: "middle" });
});
await output("ok", true);
`),
      { packDtsSources }
    );
    expect(validation.ok).toBe(false);
    const message = validation.errors
      .filter((issue) => issue.code === "js_script_type_error")
      .map((issue) => issue.message)
      .join("\n");
    expect(message.toLowerCase()).toContain("align");
  });

  it("skips the check entirely when no packDtsSources are given", async () => {
    const validation = await validateJsScriptDoc(
      doc(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.scene("s", 1, (s) => {
  s.text("hi").typewriter({ caret: true });
});
await output("ok", true);
`)
    );
    expect(codes(validation)).not.toContain("js_script_type_error");
  });
});
