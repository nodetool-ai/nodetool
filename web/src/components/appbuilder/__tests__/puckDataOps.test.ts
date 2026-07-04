import type { Config, Data } from "@puckeditor/core";

import {
  getSlotFields,
  flattenComponents,
  findComponent,
  addComponent,
  updateComponentProps,
  removeComponent,
  makeComponentId
} from "../puck/puckDataOps";

// Minimal config: a leaf widget and a Panel with a `content` slot.
const config = {
  components: {
    Text: { fields: { text: { type: "text" } }, render: () => null },
    Panel: {
      fields: { title: { type: "text" }, content: { type: "slot" } },
      render: () => null
    }
  }
} as unknown as Config;

const slotFields = getSlotFields(config);

const baseData = (): Data => ({
  root: { props: {} },
  content: [
    { type: "Text", props: { id: "t1", text: "hello" } },
    {
      type: "Panel",
      props: {
        id: "p1",
        title: "Box",
        content: [{ type: "Text", props: { id: "t2", text: "nested" } }]
      }
    }
  ],
  zones: {}
});

describe("puckDataOps", () => {
  it("derives slot fields from the config", () => {
    expect(slotFields).toEqual({ Text: [], Panel: ["content"] });
  });

  it("flattens the tree including nested slot children with parent info", () => {
    const flat = flattenComponents(baseData(), slotFields);
    expect(flat.map((c) => c.id)).toEqual(["t1", "p1", "t2"]);
    const nested = flat.find((c) => c.id === "t2");
    expect(nested?.parentId).toBe("p1");
    expect(nested?.slot).toBe("content");
  });

  it("adds a component at the top level", () => {
    const id = makeComponentId("Text", () => "abc");
    expect(id).toBe("Text-abc");
    const { data } = addComponent(baseData(), slotFields, {
      type: "Text",
      id,
      props: { text: "new" }
    });
    expect(data.content).toHaveLength(3);
    expect(data.content[2].props.id).toBe("Text-abc");
  });

  it("adds a component into a parent slot", () => {
    const { data, node } = addComponent(baseData(), slotFields, {
      type: "Text",
      id: "t3",
      parentId: "p1",
      slot: "content"
    });
    expect(node.props.id).toBe("t3");
    const panel = data.content.find((c) => c.props.id === "p1");
    const content = panel?.props.content as { props: { id: string } }[];
    expect(content.map((c) => c.props.id)).toEqual(["t2", "t3"]);
  });

  it("updates props of a nested component without changing its id", () => {
    const { data, node } = updateComponentProps(baseData(), slotFields, "t2", {
      text: "changed",
      id: "hacked"
    });
    expect(node?.props.text).toBe("changed");
    expect(node?.props.id).toBe("t2");
    expect(findComponent(data, slotFields, "t2")?.props.text).toBe("changed");
  });

  it("removes a top-level and a nested component", () => {
    const removedNested = removeComponent(baseData(), slotFields, "t2");
    expect(removedNested.removed).toBe(true);
    const panel = removedNested.data.content.find((c) => c.props.id === "p1");
    expect((panel?.props.content as unknown[]).length).toBe(0);

    const removedTop = removeComponent(baseData(), slotFields, "p1");
    expect(removedTop.removed).toBe(true);
    expect(removedTop.data.content.map((c) => c.props.id)).toEqual(["t1"]);
  });

  it("reports not removed for an unknown id", () => {
    const result = removeComponent(baseData(), slotFields, "nope");
    expect(result.removed).toBe(false);
  });
});
