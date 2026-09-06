import { appDocumentToMerge } from "../merge";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

const flatten = (content: unknown[]) =>
  appDocumentToMerge({
    ui: { root: { props: {} }, content },
    operations: [],
    variables: [],
    resources: []
  } as unknown as ApplicationDocument).content;

describe("application merge — slot detection", () => {
  it("splits a declared slot's children into their own units", () => {
    expect(
      flatten([
        {
          type: "Container",
          props: {
            id: "c1",
            content: [{ type: "Text", props: { id: "t1", text: "hi" } }]
          }
        }
      ])
    ).toEqual([
      {
        node: { type: "Container", props: { id: "c1" } },
        parentId: null,
        slot: null
      },
      {
        node: { type: "Text", props: { id: "t1", text: "hi" } },
        parentId: "c1",
        slot: "content"
      }
    ]);
  });

  it("leaves a non-slot array prop alone even when its items look like nodes", () => {
    const rows = [
      { type: "row", props: { id: "r1", label: "a" } },
      { type: "row", props: { id: "r2", label: "b" } }
    ];
    expect(
      flatten([{ type: "Text", props: { id: "t1", text: "hi", events: rows } }])
    ).toEqual([
      {
        node: { type: "Text", props: { id: "t1", text: "hi", events: rows } },
        parentId: null,
        slot: null
      }
    ]);
  });
});
