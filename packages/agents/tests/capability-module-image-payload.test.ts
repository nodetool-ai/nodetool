/**
 * Pixels cannot cross into a code action: a capability imported into an action
 * answers as a JavaScript value, and the injectable-image channel the tool loop
 * uses does not exist there. A `view_image` call written inside `execute_code`
 * therefore returned an `image_content` reference nothing ever dereferenced,
 * and the model read back only the question it had asked. These pin the note
 * that replaces the payload.
 */
import { describe, expect, it } from "vitest";

import {
  mountCapabilityModules,
  SESSION_CAPABILITY_MODULE
} from "../src/codeact/capability-modules.js";

const SPECIFIER = `@nodetool-ai/sandbox-nodetool/${SESSION_CAPABILITY_MODULE}`;

const session = [
  {
    module: SESSION_CAPABILITY_MODULE,
    exports: ["look", "count"],
    call: async (name: string) =>
      name === "look"
        ? {
            ok: true,
            image_id: "abc",
            note: "is the title centered?",
            image_content: { uri: "asset://abc", mimeType: "image/png" }
          }
        : { ok: true, total: 3 }
  }
];

const mountFor = async (code: string) => {
  const result = await mountCapabilityModules(code, undefined, { session });
  if (!result.ok || !result.mount) throw new Error("expected a mount");
  return result.mount;
};

describe("capability results carrying pixels, inside an action", () => {
  it("drops the image payload and says how to look at the image", async () => {
    const mount = await mountFor(`import { look } from "${SPECIFIER}";`);
    const value = (await mount.call(SPECIFIER, "look", [{}])) as Record<
      string,
      unknown
    >;

    expect(value["image_content"]).toBeUndefined();
    expect(value["image_id"]).toBe("abc");
    const note = String(value["note"]);
    expect(note).toContain("is the title centered?");
    expect(note).toContain("view_image");
    expect(note).toMatch(/outside execute_code/);
  });

  it("leaves an ordinary result untouched", async () => {
    const mount = await mountFor(`import { count } from "${SPECIFIER}";`);
    expect(await mount.call(SPECIFIER, "count", [{}])).toEqual({
      ok: true,
      total: 3
    });
  });
});
