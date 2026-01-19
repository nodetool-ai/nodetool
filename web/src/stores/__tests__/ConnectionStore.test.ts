import useConnectionStore from "../ConnectionStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import { NodeMetadata } from "../ApiTypes";

describe("ConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState(useConnectionStore.getInitialState());
  });

  it("initializes with default values", () => {
    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(false);
    expect(state.connectType).toBe(null);
    expect(state.connectDirection).toBe(null);
    expect(state.connectNodeId).toBe(null);
    expect(state.connectHandleId).toBe(null);
  });

  it("starts connecting from source handle using dynamic outputs", () => {
    const mockNode = {
      id: "node-1",
      type: "test",
      data: { dynamic_outputs: { output: { type: "text" } } }
    } as unknown as Node<NodeData>;

    const mockMetadata = {
      outputs: [{ name: "output", type: { type: "text" }, stream: false }]
    } as unknown as NodeMetadata;

    useConnectionStore.getState().startConnecting(
      mockNode,
      "output",
      "source",
      mockMetadata
    );

    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(true);
    expect(state.connectType).toEqual({ type: "text" });
    expect(state.connectDirection).toBe("source");
    expect(state.connectNodeId).toBe("node-1");
    expect(state.connectHandleId).toBe("output");
  });

  it("starts connecting from target handle using dynamic inputs", () => {
    const mockNode = {
      id: "node-2",
      type: "test",
      data: { dynamic_properties: { input: { type: "image" } } }
    } as unknown as Node<NodeData>;

    const mockMetadata = {
      properties: [{ name: "input", type: { type: "image" } }]
    } as unknown as NodeMetadata;

    useConnectionStore.getState().startConnecting(
      mockNode,
      "input",
      "target",
      mockMetadata
    );

    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(true);
    expect(state.connectType).toEqual({ type: "image" });
    expect(state.connectDirection).toBe("target");
    expect(state.connectNodeId).toBe("node-2");
    expect(state.connectHandleId).toBe("input");
  });

  it("ends connecting and resets all values", () => {
    const mockNode = {
      id: "node-3",
      type: "test",
      data: { dynamic_outputs: { output: { type: "text" } } }
    } as unknown as Node<NodeData>;

    const mockMetadata = {
      outputs: [{ name: "output", type: { type: "text" }, stream: false }]
    } as unknown as NodeMetadata;

    useConnectionStore.getState().startConnecting(
      mockNode,
      "output",
      "source",
      mockMetadata
    );

    useConnectionStore.getState().endConnecting();

    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(false);
    expect(state.connectType).toBe(null);
    expect(state.connectDirection).toBe(null);
    expect(state.connectNodeId).toBe(null);
    expect(state.connectHandleId).toBe(null);
  });

  it("handles startConnecting with unknown handle type gracefully", () => {
    const mockNode = {
      id: "node-4",
      type: "test",
      data: {}
    } as unknown as Node<NodeData>;

    const mockMetadata = {
      outputs: [],
      properties: []
    } as unknown as NodeMetadata;

    useConnectionStore.getState().startConnecting(
      mockNode,
      "unknown",
      "unknown",
      mockMetadata
    );

    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(false);
    expect(state.connectNodeId).toBe(null);
  });

  it("stores correct type when connecting from source", () => {
    const mockNode = {
      id: "node-5",
      type: "test",
      data: { dynamic_outputs: { audio: { type: "audio" } } }
    } as unknown as Node<NodeData>;

    const mockMetadata = {
      outputs: [{ name: "audio", type: { type: "audio" }, stream: true }]
    } as unknown as NodeMetadata;

    useConnectionStore.getState().startConnecting(
      mockNode,
      "audio",
      "source",
      mockMetadata
    );

    const state = useConnectionStore.getState();
    expect(state.connecting).toBe(true);
    expect(state.connectType).toEqual({ type: "audio" });
  });
});
