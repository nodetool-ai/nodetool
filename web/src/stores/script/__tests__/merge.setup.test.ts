/**
 * @jest-environment node
 *
 * The script merge adapter's handling of the guided setup: a server-side
 * change to it lands in a dirty draft, and a contested one is listed.
 */
import { mergeScriptDocuments, type ScriptMergeDoc } from "../merge";

const doc = (setup: unknown, title = "Film"): ScriptMergeDoc => ({
  title,
  cast: [],
  sections: [],
  timelineId: null,
  storyboardId: null,
  setup
});

const ops = [{ tool: "set_title", input: {} }];

describe("mergeScriptDocuments setup", () => {
  it("takes a server setup change into a draft that left setup alone", () => {
    const base = doc({ stage: "done", brief: "" });
    const draft = doc({ stage: "done", brief: "" }, "Edited title");
    const server = doc({
      stage: "done",
      brief: "",
      voicing: { status: "completed", total: 2, voiced: 2, failed: [] }
    });
    const { doc: merged, conflicts } = mergeScriptDocuments(base, draft, server, ops);
    expect(merged.title).toBe("Edited title");
    expect(merged.setup).toEqual(server.setup);
    expect(conflicts).toEqual([]);
  });

  it("keeps the draft's setup when both sides changed it", () => {
    const base = doc({ stage: "idea", brief: "" });
    const draft = doc({ stage: "idea", brief: "mine" });
    const server = doc({ stage: "idea", brief: "theirs" });
    const { doc: merged } = mergeScriptDocuments(base, draft, server, ops);
    expect(merged.setup).toEqual(draft.setup);
  });
});
