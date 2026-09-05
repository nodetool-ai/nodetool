import { appDocumentToMerge, mergeAppDocuments } from "../merge";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

const doc = (content: unknown[]): ApplicationDocument =>
  ({
    ui: { root: { props: {} }, content },
    operations: [],
    variables: [],
    resources: []
  }) as unknown as ApplicationDocument;

const merged = (content: unknown[]) => {
  const slice = appDocumentToMerge(doc(content));
  return mergeAppDocuments(slice, slice, slice).doc.content as Array<{
    type: string;
    props: Record<string, unknown>;
  }>;
};

describe("application merge — slot detection", () => {
  it("keeps children of a declared slot as their own units", () => {
    const out = merged([
      {
        type: "Container",
        props: {
          id: "c1",
          content: [{ type: "Text", props: { id: "t1", text: "hi" } }]
        }
      }
    ]);
    expect(out).toEqual([
      {
        type: "Container",
        props: {
          id: "c1",
          content: [{ type: "Text", props: { id: "t1", text: "hi" } }]
        }
      }
    ]);
  });

  it("leaves a non-slot array prop alone even when its items look like nodes", () => {
    const rows = [
      { type: "row", props: { id: "r1", label: "a" } },
      { type: "row", props: { id: "r2", label: "b" } }
    ];
    const out = merged([
      { type: "Text", props: { id: "t1", text: "hi", events: rows } }
    ]);
    expect(out).toEqual([
      { type: "Text", props: { id: "t1", text: "hi", events: rows } }
    ]);
  });
});
