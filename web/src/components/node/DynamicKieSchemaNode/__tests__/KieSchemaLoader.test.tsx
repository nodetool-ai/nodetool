import React from "react";
import { render, waitFor } from "@testing-library/react";
import type { NodeData } from "../../../../stores/NodeData";
import { KieSchemaLoader } from "../KieSchemaLoader";

const mockUpdateNodeData = jest.fn();
const mockResolveKieSchemaClient = jest.fn();

jest.mock("../../../ui_primitives", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Caption: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(
    (selector: (state: { updateNodeData: typeof mockUpdateNodeData }) => unknown) =>
      selector({
        updateNodeData: mockUpdateNodeData
      })
  )
}));

jest.mock("../../../../stores/BASE_URL", () => ({
  BASE_URL: ""
}));

jest.mock("../../../../utils/kieDynamicSchema", () => ({
  resolveKieSchemaClient: (...args: unknown[]) =>
    mockResolveKieSchemaClient(...args)
}));

function makeNodeData(overrides: Partial<NodeData> = {}): NodeData {
  return {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    dynamic_outputs: {},
    workflow_id: "wf-1",
    ...overrides
  };
}

describe("KieSchemaLoader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveKieSchemaClient.mockResolvedValue({
      dynamic_properties: {
        prompt: "",
        duration: 15
      },
      dynamic_inputs: {
        prompt: {
          type: "str",
          optional: false,
          description: "Prompt"
        },
        duration: {
          type: "float",
          optional: true,
          default: 15
        }
      },
      dynamic_outputs: {
        video: {
          type: "video",
          optional: false,
          type_args: []
        }
      },
      model_id: "bytedance/seedance-2"
    });
  });

  it("auto-loads again when pasted model_info changes", async () => {
    const { rerender } = render(
      <KieSchemaLoader
        nodeId="node-1"
        data={makeNodeData({
          properties: {
            model_info: "old docs"
          },
          dynamic_properties: {
            prompt: ""
          },
          dynamic_inputs: {
            prompt: {
              type: "str",
              optional: false,
              type_args: []
            }
          },
          model_id: "old/model"
        })}
      />
    );

    await waitFor(() => {
      expect(mockResolveKieSchemaClient).not.toHaveBeenCalled();
    });

    rerender(
      <KieSchemaLoader
        nodeId="node-1"
        data={makeNodeData({
          properties: {
            model_info: "new docs"
          },
          dynamic_properties: {
            prompt: ""
          },
          dynamic_inputs: {
            prompt: {
              type: "str",
              optional: false,
              type_args: []
            }
          },
          model_id: "old/model"
        })}
      />
    );

    await waitFor(() => {
      expect(mockResolveKieSchemaClient).toHaveBeenCalledWith("new docs", "");
    });

    await waitFor(() => {
      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {
          prompt: "",
          duration: 15
        },
        dynamic_inputs: {
          prompt: {
            type: "str",
            optional: false,
            description: "Prompt",
            type_args: [],
            values: undefined
          },
          duration: {
            type: "float",
            optional: true,
            default: 15,
            type_args: [],
            values: undefined
          }
        },
        dynamic_outputs: {
          video: {
            type: "video",
            optional: false,
            type_args: []
          }
        },
        model_id: "bytedance/seedance-2"
      });
    });
  });

  it("loads schema when legacy nodes store model_info in dynamic_properties", async () => {
    render(
      <KieSchemaLoader
        nodeId="node-legacy"
        data={makeNodeData({
          properties: {},
          dynamic_properties: {
            model_info: "legacy docs"
          }
        })}
      />
    );

    await waitFor(() => {
      expect(mockResolveKieSchemaClient).toHaveBeenCalledWith("legacy docs", "");
    });
  });

  it("does not double-load in React StrictMode", async () => {
    render(
      <React.StrictMode>
        <KieSchemaLoader
          nodeId="node-strict"
          data={makeNodeData({
            properties: {
              model_info: "nano banana docs"
            }
          })}
        />
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(mockResolveKieSchemaClient).toHaveBeenCalledTimes(1);
    });
    expect(mockResolveKieSchemaClient).toHaveBeenCalledWith(
      "nano banana docs",
      ""
    );
  });
});
