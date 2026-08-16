/**
 * The Code node's link/extract/detach transitions. tRPC and the node store are
 * mocked; what these assert is what the hook writes onto the node.
 */
import { renderHook, act } from "@testing-library/react";
import { asMock, stub } from "../../../test-utils/doubles";
import { useCodeNodeScriptLink } from "../useCodeNodeScriptLink";
import { useNodes } from "../../../contexts/NodeContext";
import { trpc } from "../../../trpc/client";
import type { NodeData } from "../../../stores/NodeData";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: jest.fn(),
    jsScripts: {
      get: { useQuery: jest.fn() },
      create: { useMutation: jest.fn() },
      documentVersions: { create: { useMutation: jest.fn() } }
    }
  }
}));

const scriptDocument = {
  schemaVersion: 1,
  description: "",
  code: 'await output("shouted", inputs.text.toUpperCase());',
  inputs: [{ name: "text", type: "str" }],
  outputs: [{ name: "shouted", type: "str" }],
  packages: [],
  secrets: ["API_KEY"],
  timeoutSeconds: 45,
  tests: []
};

const mockUpdateNodeData = jest.fn();
let nodeData: Partial<NodeData> = {};
const mockFindNode = jest.fn(() => ({ id: "node-1", data: nodeData }));

const createVersion = jest.fn(async () => ({ version: 7 }));
interface CreateScriptInput {
  name: string;
  document: typeof scriptDocument;
}
const createScript = jest.fn(async (input: CreateScriptInput) => ({
  id: "new-script",
  name: input.name,
  document: scriptDocument
}));
const versionsList = jest.fn(async () => [] as { version: number }[]);
const versionsGet = jest.fn(async () => ({ document: scriptDocument }));
const scriptGet = jest.fn(async () => ({
  id: "s1",
  name: "Shout",
  document: scriptDocument
}));

const data = (properties: Record<string, unknown> = {}): NodeData =>
  ({ properties }) as NodeData;

describe("useCodeNodeScriptLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nodeData = { properties: {} };
    asMock(useNodes).mockImplementation(
      <T,>(selector: (s: unknown) => T) =>
        selector({
          findNode: mockFindNode,
          updateNodeData: mockUpdateNodeData
        })
    );
    asMock(trpc.useUtils).mockReturnValue({
      jsScripts: {
        get: { fetch: scriptGet },
        list: { invalidate: jest.fn() },
        documentVersions: {
          list: { fetch: versionsList },
          get: { fetch: versionsGet }
        }
      }
    });
    asMock(trpc.jsScripts.get.useQuery).mockReturnValue({
      data: { name: "Shout" }
    });
    asMock(trpc.jsScripts.create.useMutation).mockReturnValue({
      mutateAsync: createScript
    });
    asMock(trpc.jsScripts.documentVersions.create.useMutation).mockReturnValue({ mutateAsync: createVersion });
  });

  it("reads no link from an empty script property", () => {
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data({ script: {} }))
    );
    expect(result.current.link).toBeNull();
  });

  it("reads a pinned link", () => {
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data({ script: { id: "s1", version: 2 } }))
    );
    expect(result.current.link).toEqual({ id: "s1", version: 2 });
    expect(result.current.linkedName).toBe("Shout");
  });

  it("links by snapshotting the script's current content", async () => {
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data())
    );

    await act(async () => {
      await result.current.linkScript("s1");
    });

    expect(createVersion).toHaveBeenCalledWith({
      id: "s1",
      name: "Linked from a Code node"
    });
    const [nodeId, update] = mockUpdateNodeData.mock.calls[0];
    expect(nodeId).toBe("node-1");
    expect(update.properties.script).toEqual({ id: "s1", version: 7 });
    expect(update.properties.code).toBe(scriptDocument.code);
    expect(update.properties.secrets).toEqual(["API_KEY"]);
    expect(update.properties.timeout).toBe(45);
    expect(Object.keys(update.dynamic_inputs)).toEqual(["text"]);
    expect(Object.keys(update.dynamic_outputs)).toEqual(["shouted"]);
  });

  it("writes the whole materialized body in one undoable update", async () => {
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data())
    );

    await act(async () => {
      await result.current.linkScript("s1");
    });

    expect(mockUpdateNodeData).toHaveBeenCalledTimes(1);
  });

  it("re-copies the script on update to latest", async () => {
    versionsList.mockResolvedValueOnce([{ version: 9 }]);
    versionsGet.mockResolvedValueOnce({ document: scriptDocument });
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data({ script: { id: "s1", version: 2 } }))
    );

    await act(async () => {
      await result.current.updateToLatest();
    });

    const update = mockUpdateNodeData.mock.calls[0][1];
    expect(update.properties.script).toEqual({ id: "s1", version: 9 });
    expect(update.properties.code).toBe(scriptDocument.code);
  });

  it("reuses the newest snapshot when it already matches", async () => {
    versionsList.mockResolvedValueOnce([{ version: 4 }]);
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data())
    );

    await act(async () => {
      await result.current.linkScript("s1");
    });

    expect(createVersion).not.toHaveBeenCalled();
    expect(mockUpdateNodeData.mock.calls[0][1].properties.script).toEqual({
      id: "s1",
      version: 4
    });
  });

  it("extracts the node's body and ports into a new script, then links it", async () => {
    nodeData = stub<Partial<NodeData>>({
      properties: {
        code: "await output('out', 1);",
        secrets: ["TOKEN"],
        timeout: 12
      },
      dynamic_inputs: { text: { type: { type: "str" } } },
      dynamic_outputs: { out: { type: "int" } }
    });
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data())
    );

    let created = "";
    await act(async () => {
      created = await result.current.extractToScript("Extracted");
    });

    expect(created).toBe("new-script");
    const submitted = createScript.mock.calls[0][0];
    expect(submitted.name).toBe("Extracted");
    expect(submitted.document.code).toBe("await output('out', 1);");
    expect(submitted.document.inputs).toEqual([{ name: "text", type: "str" }]);
    expect(submitted.document.outputs).toEqual([{ name: "out", type: "int" }]);
    expect(submitted.document.secrets).toEqual(["TOKEN"]);
    expect(submitted.document.timeoutSeconds).toBe(12);
    expect(mockUpdateNodeData.mock.calls[0][1].properties.script).toEqual({
      id: "new-script",
      version: 7
    });
  });

  it("detaches by dropping the link and keeping the body", () => {
    nodeData = {
      properties: { code: "pinned body", script: { id: "s1", version: 2 } }
    };
    const { result } = renderHook(() =>
      useCodeNodeScriptLink("node-1", data({ script: { id: "s1", version: 2 } }))
    );

    act(() => {
      result.current.detach();
    });

    const update = mockUpdateNodeData.mock.calls[0][1];
    expect(update.properties.script).toBeUndefined();
    expect(update.properties.code).toBe("pinned body");
  });
});
