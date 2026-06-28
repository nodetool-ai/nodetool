import { propType, prop, out, meta, node, edge, castMessages } from "../castHelpers";

describe("castHelpers", () => {
  describe("propType", () => {
    it("creates a property type metadata with the given type", () => {
      const result = propType("string");
      expect(result).toEqual({
        type: "string",
        optional: false,
        type_args: []
      });
    });
  });

  describe("prop", () => {
    it("creates a property with name and type", () => {
      const result = prop("prompt", "string");
      expect(result.name).toBe("prompt");
      expect(result.type).toEqual(propType("string"));
      expect(result.title).toBe("prompt");
      expect(result.default).toBeUndefined();
      expect(result.description).toBeNull();
      expect(result.min).toBeNull();
      expect(result.max).toBeNull();
    });
  });

  describe("out", () => {
    it("creates an output slot", () => {
      const result = out("image", "ImageRef");
      expect(result.name).toBe("image");
      expect(result.type).toEqual(propType("ImageRef"));
      expect(result.stream).toBe(false);
    });

    it("creates a streaming output slot", () => {
      const result = out("text", "string", true);
      expect(result.stream).toBe(true);
    });
  });

  describe("meta", () => {
    it("creates node metadata with defaults", () => {
      const result = meta({ node_type: "nodetool.image.TextToImage" });
      expect(result.node_type).toBe("nodetool.image.TextToImage");
      expect(result.title).toBe("TextToImage");
      expect(result.namespace).toBe("nodetool.image");
      expect(result.properties).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.layout).toBe("default");
    });

    it("derives title from the last segment of node_type", () => {
      expect(meta({ node_type: "a.b.MyNode" }).title).toBe("MyNode");
    });

    it("allows overriding defaults", () => {
      const result = meta({
        node_type: "nodetool.text.Generate",
        title: "Custom Title",
        properties: [prop("text", "string")]
      });
      expect(result.title).toBe("Custom Title");
      expect(result.properties).toHaveLength(1);
    });
  });

  describe("node", () => {
    it("creates a graph node with position and title", () => {
      const result = node("n1", "nodetool.text.Generate", 100, 200, 300, "Gen");
      expect(result.id).toBe("n1");
      expect(result.type).toBe("nodetool.text.Generate");
      expect(result.ui_properties.position).toEqual({ x: 100, y: 200 });
      expect(result.ui_properties.width).toBe(300);
      expect(result.ui_properties.title).toBe("Gen");
      expect(result.ui_properties.selectable).toBe(true);
      expect(result.ui_properties.zIndex).toBe(0);
      expect(result.data).toEqual({});
      expect(result.dynamic_properties).toEqual({});
      expect(result.dynamic_outputs).toEqual({});
    });

    it("accepts custom data", () => {
      const result = node("n1", "type", 0, 0, 100, "t", { foo: "bar" });
      expect(result.data).toEqual({ foo: "bar" });
    });
  });

  describe("edge", () => {
    it("creates an edge between nodes", () => {
      const result = edge("e1", "n1", "output", "n2", "input");
      expect(result).toEqual({
        id: "e1",
        source: "n1",
        sourceHandle: "output",
        target: "n2",
        targetHandle: "input"
      });
    });
  });

  describe("castMessages", () => {
    const wfId = "wf-1";
    const jobId = "job-1";
    const msgs = castMessages(wfId, jobId);

    it("creates a jobUpdate event", () => {
      const event = msgs.jobUpdate(100, "running");
      expect(event.t).toBe(100);
      expect(event.message.type).toBe("job_update");
      expect(event.message).toMatchObject({
        status: "running",
        workflow_id: wfId,
        job_id: jobId
      });
    });

    it("creates a jobUpdate with result", () => {
      const event = msgs.jobUpdate(500, "completed", { output: "done" });
      expect(event.message).toMatchObject({
        status: "completed",
        result: { output: "done" }
      });
    });

    it("creates a nodeUpdate event", () => {
      const event = msgs.nodeUpdate(200, "n1", "Gen", "nodetool.text.Generate", "running");
      expect(event.t).toBe(200);
      expect(event.message).toMatchObject({
        type: "node_update",
        node_id: "n1",
        node_name: "Gen",
        node_type: "nodetool.text.Generate",
        status: "running"
      });
    });

    it("creates a chunk event", () => {
      const event = msgs.chunk(300, "n1", "hello");
      expect(event.message).toMatchObject({
        type: "chunk",
        node_id: "n1",
        content: "hello",
        content_type: "text"
      });
    });

    it("creates an edgeUpdate event", () => {
      const event = msgs.edgeUpdate(400, "e1", "active");
      expect(event.message).toMatchObject({
        type: "edge_update",
        edge_id: "e1",
        status: "active"
      });
    });

    it("creates an output event", () => {
      const event = msgs.output(500, "n1", "Gen", "image", "data:img", "ImageRef");
      expect(event.message).toMatchObject({
        type: "output_update",
        node_id: "n1",
        output_name: "image",
        value: "data:img",
        output_type: "ImageRef"
      });
    });

    it("creates a stream of chunk events evenly spaced", () => {
      const events = msgs.stream("n1", ["a", "b", "c"], 1000, 300);
      expect(events).toHaveLength(3);
      expect(events[0].t).toBe(1000);
      expect(events[1].t).toBe(1100);
      expect(events[2].t).toBe(1200);
      expect((events[0].message as { content: string }).content).toBe("a");
      expect((events[2].message as { content: string }).content).toBe("c");
    });

    it("creates a progress ramp", () => {
      const events = msgs.progress("n1", 3, 0, 300);
      expect(events).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        const msg = events[i].message as { progress: number; total: number };
        expect(msg.progress).toBe(i + 1);
        expect(msg.total).toBe(3);
      }
      expect(events[2].t).toBe(300);
    });
  });
});
