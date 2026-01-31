import { act } from "@testing-library/react";
import { useMiniAppsStore } from "../MiniAppsStore";
import { MiniAppInputDefinition, MiniAppResult, MiniAppProgress } from "../../components/miniapps/types";

describe("MiniAppsStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useMiniAppsStore.setState({ apps: {} });
  });

  describe("initial state", () => {
    it("has empty apps record", () => {
      const { apps } = useMiniAppsStore.getState();
      expect(apps).toEqual({});
    });
  });

  describe("initializeInputDefaults", () => {
    it("initializes defaults for new workflow", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "string",
          data: { name: "textInput", label: "Text", description: "Enter text", value: "default" }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"]).toBeDefined();
      expect(apps["workflow1"].inputValues["textInput"]).toBe("default");
    });

    it("initializes boolean to false if no value provided", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "boolean",
          data: { name: "boolInput", label: "Toggle", description: "Toggle" }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["boolInput"]).toBe(false);
    });

    it("does not override existing values", () => {
      // First set an existing value
      useMiniAppsStore.setState({
        apps: {
          workflow1: {
            inputValues: { textInput: "existingValue" },
            results: [],
            progress: null,
            lastRunDuration: null
          }
        }
      });

      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "string",
          data: { name: "textInput", label: "Text", description: "Enter text", value: "newDefault" }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["textInput"]).toBe("existingValue");
    });

    it("handles multiple definitions", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "string",
          data: { name: "input1", label: "Input 1", description: "First", value: "value1" }
        },
        {
          nodeId: "node2",
          nodeType: "input",
          kind: "integer",
          data: { name: "input2", label: "Input 2", description: "Second", value: 42 }
        },
        {
          nodeId: "node3",
          nodeType: "input",
          kind: "boolean",
          data: { name: "input3", label: "Input 3", description: "Third" }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["input1"]).toBe("value1");
      expect(apps["workflow1"].inputValues["input2"]).toBe(42);
      expect(apps["workflow1"].inputValues["input3"]).toBe(false);
    });

    it("sets undefined for non-boolean types without value", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "string",
          data: { name: "textInput", label: "Text", description: "Enter text" }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["textInput"]).toBeUndefined();
    });

    it("sets first option for select inputs without value", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "select",
          data: { 
            name: "selectInput", 
            label: "Select", 
            description: "Choose one",
            options: ["option1", "option2", "option3"]
          }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["selectInput"]).toBe("option1");
    });

    it("sets undefined for select inputs with no options", () => {
      const definitions: MiniAppInputDefinition[] = [
        {
          nodeId: "node1",
          nodeType: "input",
          kind: "select",
          data: { 
            name: "selectInput", 
            label: "Select", 
            description: "Choose one",
            options: []
          }
        }
      ];

      act(() => {
        useMiniAppsStore.getState().initializeInputDefaults("workflow1", definitions);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["selectInput"]).toBeUndefined();
    });
  });

  describe("setInputValue", () => {
    it("sets a single input value", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "hello");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["myInput"]).toBe("hello");
    });

    it("updates an existing input value", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "initial");
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "updated");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["myInput"]).toBe("updated");
    });

    it("does not change state if value is the same", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "same");
      });

      const stateBefore = useMiniAppsStore.getState();

      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "same");
      });

      const stateAfter = useMiniAppsStore.getState();
      // Should be same reference since no change
      expect(stateBefore).toBe(stateAfter);
    });

    it("handles multiple workflows independently", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "input", "value1");
        useMiniAppsStore.getState().setInputValue("workflow2", "input", "value2");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["input"]).toBe("value1");
      expect(apps["workflow2"].inputValues["input"]).toBe("value2");
    });
  });

  describe("setInputValues", () => {
    it("sets all input values at once", () => {
      const values = { input1: "value1", input2: 42, input3: true };

      act(() => {
        useMiniAppsStore.getState().setInputValues("workflow1", values);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues).toEqual(values);
    });

    it("replaces all existing input values", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "oldInput", "oldValue");
        useMiniAppsStore.getState().setInputValues("workflow1", { newInput: "newValue" });
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues).toEqual({ newInput: "newValue" });
      expect(apps["workflow1"].inputValues["oldInput"]).toBeUndefined();
    });
  });

  describe("upsertResult", () => {
    const baseResult: MiniAppResult = {
      id: "result1",
      nodeId: "node1",
      nodeName: "Node 1",
      outputName: "output",
      outputType: "string",
      value: "test value",
      receivedAt: Date.now()
    };

    it("adds a new result", () => {
      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", baseResult);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(1);
      expect(apps["workflow1"].results[0]).toEqual(baseResult);
    });

    it("updates an existing result with same id", () => {
      const updatedResult = { ...baseResult, value: "updated value" };

      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", baseResult);
        useMiniAppsStore.getState().upsertResult("workflow1", updatedResult);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(1);
      expect(apps["workflow1"].results[0].value).toBe("updated value");
    });

    it("adds multiple different results", () => {
      const result2: MiniAppResult = { ...baseResult, id: "result2", nodeId: "node2" };

      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", baseResult);
        useMiniAppsStore.getState().upsertResult("workflow1", result2);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(2);
    });
  });

  describe("setResults", () => {
    it("sets all results at once", () => {
      const results: MiniAppResult[] = [
        {
          id: "result1",
          nodeId: "node1",
          nodeName: "Node 1",
          outputName: "output",
          outputType: "string",
          value: "value1",
          receivedAt: Date.now()
        },
        {
          id: "result2",
          nodeId: "node2",
          nodeName: "Node 2",
          outputName: "output",
          outputType: "number",
          value: 42,
          receivedAt: Date.now()
        }
      ];

      act(() => {
        useMiniAppsStore.getState().setResults("workflow1", results);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(2);
    });

    it("replaces existing results", () => {
      const initialResult: MiniAppResult = {
        id: "initial",
        nodeId: "node1",
        nodeName: "Node 1",
        outputName: "output",
        outputType: "string",
        value: "initial",
        receivedAt: Date.now()
      };

      const newResults: MiniAppResult[] = [
        {
          id: "new",
          nodeId: "node2",
          nodeName: "Node 2",
          outputName: "output",
          outputType: "string",
          value: "new",
          receivedAt: Date.now()
        }
      ];

      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", initialResult);
        useMiniAppsStore.getState().setResults("workflow1", newResults);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(1);
      expect(apps["workflow1"].results[0].id).toBe("new");
    });
  });

  describe("clearResults", () => {
    it("clears all results for a workflow", () => {
      const result: MiniAppResult = {
        id: "result1",
        nodeId: "node1",
        nodeName: "Node 1",
        outputName: "output",
        outputType: "string",
        value: "value",
        receivedAt: Date.now()
      };

      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", result);
        useMiniAppsStore.getState().clearResults("workflow1");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(0);
    });

    it("does not change state if results are already empty", () => {
      useMiniAppsStore.setState({
        apps: {
          workflow1: {
            inputValues: {},
            results: [],
            progress: null,
            lastRunDuration: null
          }
        }
      });

      const stateBefore = useMiniAppsStore.getState();

      act(() => {
        useMiniAppsStore.getState().clearResults("workflow1");
      });

      const stateAfter = useMiniAppsStore.getState();
      expect(stateBefore).toBe(stateAfter);
    });
  });

  describe("setProgress", () => {
    it("sets progress for a workflow", () => {
      const progress: MiniAppProgress = { current: 5, total: 10 };

      act(() => {
        useMiniAppsStore.getState().setProgress("workflow1", progress);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].progress).toEqual(progress);
    });

    it("clears progress when set to null", () => {
      const progress: MiniAppProgress = { current: 5, total: 10 };

      act(() => {
        useMiniAppsStore.getState().setProgress("workflow1", progress);
        useMiniAppsStore.getState().setProgress("workflow1", null);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].progress).toBeNull();
    });

    it("updates progress as it changes", () => {
      act(() => {
        useMiniAppsStore.getState().setProgress("workflow1", { current: 1, total: 10 });
        useMiniAppsStore.getState().setProgress("workflow1", { current: 5, total: 10 });
        useMiniAppsStore.getState().setProgress("workflow1", { current: 10, total: 10 });
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].progress).toEqual({ current: 10, total: 10 });
    });
  });

  describe("setLastRunDuration", () => {
    it("sets last run duration for a workflow", () => {
      act(() => {
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 5000);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].lastRunDuration).toBe(5000);
    });

    it("clears last run duration when set to null", () => {
      act(() => {
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 5000);
        useMiniAppsStore.getState().setLastRunDuration("workflow1", null);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].lastRunDuration).toBeNull();
    });

    it("updates last run duration on subsequent runs", () => {
      act(() => {
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 5000);
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 8000);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].lastRunDuration).toBe(8000);
    });

    it("handles different workflows independently", () => {
      act(() => {
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 3000);
        useMiniAppsStore.getState().setLastRunDuration("workflow2", 7000);
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].lastRunDuration).toBe(3000);
      expect(apps["workflow2"].lastRunDuration).toBe(7000);
    });
  });

  describe("resetWorkflowState", () => {
    it("resets results and progress while preserving input values", () => {
      const result: MiniAppResult = {
        id: "result1",
        nodeId: "node1",
        nodeName: "Node 1",
        outputName: "output",
        outputType: "string",
        value: "value",
        receivedAt: Date.now()
      };

      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "myInput", "keepThis");
        useMiniAppsStore.getState().upsertResult("workflow1", result);
        useMiniAppsStore.getState().setProgress("workflow1", { current: 5, total: 10 });
        useMiniAppsStore.getState().resetWorkflowState("workflow1");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["myInput"]).toBe("keepThis");
      expect(apps["workflow1"].results).toHaveLength(0);
      expect(apps["workflow1"].progress).toBeNull();
    });

    it("also resets lastRunDuration to null", () => {
      act(() => {
        useMiniAppsStore.getState().setLastRunDuration("workflow1", 5000);
        useMiniAppsStore.getState().resetWorkflowState("workflow1");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].lastRunDuration).toBeNull();
    });

    it("creates default state for non-existent workflow", () => {
      act(() => {
        useMiniAppsStore.getState().resetWorkflowState("newWorkflow");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["newWorkflow"]).toBeDefined();
      expect(apps["newWorkflow"].results).toEqual([]);
      expect(apps["newWorkflow"].progress).toBeNull();
    });
  });

  describe("workflow isolation", () => {
    it("maintains separate state for different workflows", () => {
      act(() => {
        useMiniAppsStore.getState().setInputValue("workflow1", "input", "value1");
        useMiniAppsStore.getState().setInputValue("workflow2", "input", "value2");
        useMiniAppsStore.getState().setProgress("workflow1", { current: 1, total: 10 });
        useMiniAppsStore.getState().setProgress("workflow2", { current: 5, total: 20 });
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].inputValues["input"]).toBe("value1");
      expect(apps["workflow2"].inputValues["input"]).toBe("value2");
      expect(apps["workflow1"].progress).toEqual({ current: 1, total: 10 });
      expect(apps["workflow2"].progress).toEqual({ current: 5, total: 20 });
    });

    it("clearing one workflow does not affect others", () => {
      const result: MiniAppResult = {
        id: "result1",
        nodeId: "node1",
        nodeName: "Node 1",
        outputName: "output",
        outputType: "string",
        value: "value",
        receivedAt: Date.now()
      };

      act(() => {
        useMiniAppsStore.getState().upsertResult("workflow1", result);
        useMiniAppsStore.getState().upsertResult("workflow2", { ...result, id: "result2" });
        useMiniAppsStore.getState().clearResults("workflow1");
      });

      const { apps } = useMiniAppsStore.getState();
      expect(apps["workflow1"].results).toHaveLength(0);
      expect(apps["workflow2"].results).toHaveLength(1);
    });
  });
});
