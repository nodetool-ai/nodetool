import { act, renderHook } from "@testing-library/react";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

import {
  importedFromText,
  readScriptSource,
  scriptSourcePatch
} from "../../../../lib/script/importedScript";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import { useScriptFileImport } from "../useScriptFileImport";

const SCRIPT_ID = "s-import";

/** jsdom's File has no `text()`, and the import paths read the bytes. */
const upload = (name: string, content: string): File => {
  const file = new File([content], name, { type: "text/plain" });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(content)
  });
  return file;
};

const sourceNow = () =>
  readScriptSource(useScriptStore.getState().scripts[SCRIPT_ID].setup ?? null);

beforeEach(() => {
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().ensureScript(SCRIPT_ID);
  useScriptStore
    .getState()
    .setSetup(
      SCRIPT_ID,
      scriptSourcePatch(importedFromText("The tide came in at noon."))
    );
});

describe("useScriptFileImport", () => {
  it("keeps the current source when a file holds no lines", async () => {
    const { result } = renderHook(() => useScriptFileImport(SCRIPT_ID));

    await act(async () => {
      await result.current.importText(upload("empty.txt", "  \n"));
    });

    expect(result.current.error).toBe("No lines were found in this file.");
    expect(sourceNow()?.lines.map((line) => line.text)).toEqual([
      "The tide came in at noon."
    ]);
  });
});
