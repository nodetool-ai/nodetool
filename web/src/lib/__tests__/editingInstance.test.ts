import { editingInstanceFor } from "../editingInstance";

describe("editingInstanceFor", () => {
  it("keeps one instance per document in a page", () => {
    const first = editingInstanceFor("workflow", "w1");
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(editingInstanceFor("workflow", "w1")).toBe(first);
    expect(editingInstanceFor("workflow", "w2")).not.toBe(first);
    expect(editingInstanceFor("timeline", "w1")).not.toBe(first);
  });
});
