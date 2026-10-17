// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState, type ChangeEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CdpPage } from "../src/cdp-page.js";

// Execute the exact serialized function the local and extension CDP clients receive.
const page = new CdpPage(
  {
    Runtime: {
      evaluate: async () => ({ result: { objectId: "window" } }),
      callFunctionOn: async (request: {
        functionDeclaration: string;
        arguments: { value: unknown }[];
      }) => {
        try {
          const fn = window.eval(`(${request.functionDeclaration})`);
          return {
            result: {
              value: await fn(
                ...request.arguments.map((argument) => argument.value)
              )
            }
          };
        } catch (error) {
          return {
            exceptionDetails: { exception: { description: String(error) } }
          };
        }
      },
      releaseObject: async () => undefined
    }
  },
  { width: 1280, height: 900 }
);

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("CdpPage.fill", () => {
  it.each(["input", "textarea"] as const)(
    "updates controlled React %s state",
    async (tag) => {
      const Controlled = () => {
        const [value, setValue] = useState("initial");
        return createElement(
          "div",
          null,
          createElement(tag, {
            id: "field",
            value,
            onChange: (
              event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) => setValue(event.currentTarget.value)
          }),
          createElement("output", null, value)
        );
      };
      await act(async () => root.render(createElement(Controlled)));
      await act(async () => page.fill("#field", "typed value"));
      expect(document.querySelector("output")?.textContent).toBe("typed value");
      await act(async () => page.fill("#field", ""));
      expect(document.querySelector("output")?.textContent).toBe("");
    }
  );

  it("fills editable text and dispatches input", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="editable" contenteditable="true">initial</div>'
    );
    const element = document.getElementById("editable")!;
    const onInput = vi.fn();
    element.addEventListener("input", onInput);
    await page.fill("#editable", "edited");
    expect(element.textContent).toBe("edited");
    expect(onInput).toHaveBeenCalledOnce();
  });

  it("preserves file input validation errors", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<input id="file" type="file">'
    );
    await expect(page.fill("#file", "file.txt")).rejects.toThrow();
  });

  it("reports missing and noneditable targets", async () => {
    await expect(page.fill("#missing", "text")).rejects.toThrow(
      "Element not found"
    );
    await expect(page.fill("#root", "text")).rejects.toThrow("editable");
  });
});
