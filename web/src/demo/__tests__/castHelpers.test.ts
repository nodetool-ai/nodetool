import {
  propType,
  prop,
  out,
  meta,
  node,
  edge,
  castMessages
} from "../castHelpers";

describe("castHelpers", () => {
  describe("propType", () => {
    it("creates a PropertyTypeMetadata with defaults", () => {
      const result = propType("string");
      expect(result).toEqual({
        type: "string",
        optional: false,
        type_args: []
      });
    });

    it("works with complex types", () => {
      const result = propType("nodetool.types.ImageRef");
      expect(result.type).toBe("nodetool.types.ImageRef");
      expect(result.optional).toBe(false);
    });
  });

  describe("prop", () => {
    it("creates a Property with name and type", () => {
      const result = prop("prompt", "string");
      expect(result.name).toBe("prompt");
      expect(result.title).toBe("prompt");
      expect(result.type).toEqual(propType("string"));
      expect(result.default).toBeUndefined();
      expect(result.description).toBeNull();
      expect(result.min).toBeNull();
      expect(result.max).toBeNull();
      expect(result.required).toBe(false);
    });
  });

  describe("out", () => {
    it("creates a non-streaming output slot", () => {
      const result = out("image", "nodetool.types.ImageRef");
      expect(result.name).toBe("image");
      expect(result.type).toEqual(propType("nodetool.types.ImageRef"));
      expect(result.stream).toBe(false);
    });

    it("creates a streaming output slot", () => {
      const result = out("text", "string", true);
      expect(result.stream).toBe(true);
    });
  });

  describe("meta", () => {
    it("derives title from node_type", () => {
      const result = meta({ node_type: "nodetool.text.Concat" });
      expect(result.title).toBe("Concat");
      expect(result.namespace).toBe("nodetool.text");
    });

    it("fills in defaults", () => {
      const result = meta({ node_type: "nodetool.image.TextToImage" });
      expect(result.description).toBe("");
      expect(result.layout).toBe("default");
      expect(result.properties).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.recommended_models).toEqual([]);
      expect(result.supports_dynamic_inputs).toBe(false);
      expect(result.is_streaming_output).toBe(false);
    });

    it("allows overriding defaults", () => {
      const result = meta({
        node_type: "nodetool.text.Concat",
        title: "Custom Title",
        layout: "sidebar",
        properties: [prop("a", "string")]
      });
      expect(result.title).toBe("Custom Title");
      expect(result.layout).toBe("sidebar");
      expect(result.properties).toHaveLength(1);
    });

    it("handles single-segment node_type", () => {
      const result = meta({ node_type: "Standalone" });
      expect(result.title).toBe("Standalone");
      expect(result.namespace).toBe("");
    });
  });

  describe("node", () => {
    it("creates a graph node with position and dimensions", () => {
      const result = node("n1", "nodetool.text.Concat", 100, 200, 300, "Concat");
      expect(result.id).toBe("n1");
      expect(result.type).toBe("nodetool.text.Concat");
      expect(result.ui_properties.position).toEqual({ x: 100, y: 200 });
      expect(result.ui_properties.width).toBe(300);
      expect(result.ui_properties.title).toBe("Concat");
      expect(result.ui_properties.zIndex).toBe(0);
      expect(result.ui_properties.selectable).toBe(true);
      expect(result.data).toEqual({});
      expect(result.dynamic_properties).toEqual({});
      expect(result.dynamic_outputs).toEqual({});
    });

    it("accepts custom data and dynamic properties", () => {
      const result = node(
        "n2",
        "type",
        0,
        0,
        200,
        "Title",
        { prompt: "hello" },
        { extra: true }
      );
      expect(result.data).toEqual({ prompt: "hello" });
      expect(result.dynamic_properties).toEqual({ extra: true });
    });
  });

  describe("edge", () => {
    it("creates an edge connecting two nodes", () => {
      const result = edge("e1", "src", "output", "tgt", "input");
      expect(result).toEqual({
        id: "e1",
        source: "src",
        sourceHandle: "output",
        target: "tgt",
        targetHandle: "input"
      });
    });
  });

  describe("castMessages", () => {
    const workflowId = "wf-1";
    const jobId = "job-1";
    const msgs = castMessages(workflowId, jobId);

    it("jobUpdate produces a job_update event", () => {
      const ev = msgs.jobUpdate(100, "running");
      expect(ev.t).toBe(100);
      expect(ev.message.type).toBe("job_update");
      expect(ev.message.status).toBe("running");
      expect(ev.message.workflow_id).toBe(workflowId);
      expect(ev.message.job_id).toBe(jobId);
    });

    it("jobUpdate includes result when provided", () => {
      const ev = msgs.jobUpdate(200, "completed", { output: "done" });
      expect(ev.message.result).toEqual({ output: "done" });
    });

    it("jobUpdate omits result when not provided", () => {
      const ev = msgs.jobUpdate(200, "running");
      expect(ev.message).not.toHaveProperty("result");
    });

    it("nodeUpdate produces a node_update event", () => {
      const ev = msgs.nodeUpdate(150, "n1", "Concat", "nodetool.text.Concat", "running");
      expect(ev.t).toBe(150);
      expect(ev.message.type).toBe("node_update");
      expect(ev.message.node_id).toBe("n1");
      expect(ev.message.node_name).toBe("Concat");
      expect(ev.message.node_type).toBe("nodetool.text.Concat");
      expect(ev.message.status).toBe("running");
    });

    it("chunk produces a chunk event", () => {
      const ev = msgs.chunk(300, "n1", "hello");
      expect(ev.t).toBe(300);
      expect(ev.message.type).toBe("chunk");
      expect(ev.message.node_id).toBe("n1");
      expect(ev.message.content).toBe("hello");
      expect(ev.message.content_type).toBe("text");
    });

    it("edgeUpdate produces an edge_update event", () => {
      const ev = msgs.edgeUpdate(400, "e1", "active");
      expect(ev.t).toBe(400);
      expect(ev.message.type).toBe("edge_update");
      expect(ev.message.edge_id).toBe("e1");
      expect(ev.message.status).toBe("active");
    });

    it("output produces an output_update event", () => {
      const ev = msgs.output(500, "n1", "Concat", "result", "merged", "string");
      expect(ev.t).toBe(500);
      expect(ev.message.type).toBe("output_update");
      expect(ev.message.node_id).toBe("n1");
      expect(ev.message.output_name).toBe("result");
      expect(ev.message.value).toBe("merged");
      expect(ev.message.output_type).toBe("string");
    });

    it("stream splits text into timed chunks", () => {
      const events = msgs.stream("n1", ["a", "b", "c"], 1000, 300);
      expect(events).toHaveLength(3);
      expect(events[0].t).toBe(1000);
      expect(events[0].message.content).toBe("a");
      expect(events[1].t).toBe(1100);
      expect(events[1].message.content).toBe("b");
      expect(events[2].t).toBe(1200);
      expect(events[2].message.content).toBe("c");
    });

    it("stream handles single chunk", () => {
      const events = msgs.stream("n1", ["only"], 500, 100);
      expect(events).toHaveLength(1);
      expect(events[0].t).toBe(500);
    });

    it("progress produces a ramp of node_progress events", () => {
      const events = msgs.progress("n1", 4, 0, 400);
      expect(events).toHaveLength(4);
      expect(events[0].message.type).toBe("node_progress");
      expect(events[0].message.progress).toBe(1);
      expect(events[0].message.total).toBe(4);
      expect(events[3].message.progress).toBe(4);
      expect(events[3].t).toBe(400);
    });

    it("progress timestamps are monotonically non-decreasing", () => {
      const events = msgs.progress("n1", 10, 100, 1000);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
      }
    });
  });
});
