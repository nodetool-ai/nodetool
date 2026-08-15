/**
 * @jest-environment node
 *
 * The assistant wrote `export async function run(inputs)` for a video-frame
 * script. That wrapper is a validation error and never executes. These
 * assertions lock the prompt that has to stop it.
 */
import {
  JS_SCRIPT_BODY_CONTRACT,
  jsScriptSystemPrompt
} from "../jsScriptBodyContract";

describe("JS script body contract", () => {
  it("forbids a module wrapper and shows a top-level body", () => {
    expect(JS_SCRIPT_BODY_CONTRACT).toContain("top-level statements");
    expect(JS_SCRIPT_BODY_CONTRACT).toContain("export");
    expect(JS_SCRIPT_BODY_CONTRACT).toContain("function run");
    expect(JS_SCRIPT_BODY_CONTRACT).toContain(
      "await output(\"image\", await image.toAsset(frame))"
    );
    expect(JS_SCRIPT_BODY_CONTRACT).not.toMatch(
      /export async function run/
    );
  });

  it("is the body of the script assistant prompt", () => {
    const prompt = jsScriptSystemPrompt("script-1");
    expect(prompt).toContain('script id "script-1"');
    expect(prompt).toContain(JS_SCRIPT_BODY_CONTRACT);
  });

  it("tells the assistant that run and test flush, and empty is not done", () => {
    const prompt = jsScriptSystemPrompt("script-1");
    expect(prompt).toMatch(/flush/i);
    expect(prompt).toContain("ui_jsscript_set_tests");
    expect(prompt).toMatch(/empty outputs/i);
  });
});
