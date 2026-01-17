import { create } from "zustand";

export type ABTestStatus = "idle" | "running" | "completed" | "error";

export interface ABTestWorkflowResult {
  version: number;
  status: ABTestStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  nodesCompleted: number;
  totalNodes: number;
  results: Record<string, any>;
  error?: string;
}

export interface ABTestResult {
  id: string;
  workflowId: string;
  baseVersion: number;
  testVersion: number;
  status: ABTestStatus;
  startTime: number;
  endTime?: number;
  workflows: {
    base: ABTestWorkflowResult;
    test: ABTestWorkflowResult;
  };
  comparison?: {
    baseWins: string[];
    testWins: string[];
    ties: string[];
  };
}

interface ABTestResultsState {
  currentTest: ABTestResult | null;
  testHistory: ABTestResult[];

  startABTest: (workflowId: string, baseVersion: number, testVersion: number) => void;
  completeWorkflow: (workflowType: "base" | "test", results: Record<string, any>) => void;
  failWorkflow: (workflowType: "base" | "test", error: string) => void;
  setComparison: (comparison: ABTestResult["comparison"]) => void;
  completeTest: () => void;
  getCurrentTest: () => ABTestResult | null;
  getTestHistory: () => ABTestResult[];
  updateProgress: (workflowType: "base" | "test", nodesCompleted: number, totalNodes: number) => void;
  clearCurrentTest: () => void;
  clearHistory: () => void;
}

export const useABTestResultsStore = create<ABTestResultsState>((set, get) => ({
  currentTest: null,
  testHistory: [],

  startABTest: (workflowId, baseVersion, testVersion) => {
    const startTime = Date.now();
    const test: ABTestResult = {
      id: `ab-test-${startTime}`,
      workflowId,
      baseVersion,
      testVersion,
      status: "running",
      startTime,
      workflows: {
        base: {
          version: baseVersion,
          status: "running",
          startTime,
          nodesCompleted: 0,
          totalNodes: 0,
          results: {}
        },
        test: {
          version: testVersion,
          status: "running",
          startTime,
          nodesCompleted: 0,
          totalNodes: 0,
          results: {}
        }
      }
    };
    set({ currentTest: test });
  },

  completeWorkflow: (workflowType, results) => {
    const currentTest = get().currentTest;
    if (!currentTest) return;

    const endTime = Date.now();
    const workflowResult = workflowType === "base"
      ? currentTest.workflows.base
      : currentTest.workflows.test;

    const updatedWorkflow: ABTestWorkflowResult = {
      ...workflowResult,
      status: "completed",
      endTime,
      duration: endTime - workflowResult.startTime,
      results
    };

    const updatedTest = {
      ...currentTest,
      workflows: {
        ...currentTest.workflows,
        [workflowType]: updatedWorkflow
      }
    };

    // Check if both workflows are complete
    if (updatedTest.workflows.base.status === "completed" &&
        updatedTest.workflows.test.status === "completed") {
      updatedTest.status = "completed";
      updatedTest.endTime = endTime;
    }

    set({ currentTest: updatedTest });
  },

  failWorkflow: (workflowType, error) => {
    const currentTest = get().currentTest;
    if (!currentTest) return;

    const endTime = Date.now();
    const workflowResult = workflowType === "base"
      ? currentTest.workflows.base
      : currentTest.workflows.test;

    const updatedWorkflow: ABTestWorkflowResult = {
      ...workflowResult,
      status: "error" as const,
      endTime,
      duration: endTime - workflowResult.startTime,
      error
    };

    const updatedTest = {
      ...currentTest,
      status: "error" as const,
      workflows: {
        ...currentTest.workflows,
        [workflowType]: updatedWorkflow
      }
    };

    set({ currentTest: updatedTest });
  },

  updateProgress: (workflowType, nodesCompleted, totalNodes) => {
    const currentTest = get().currentTest;
    if (!currentTest) return;

    const workflowResult = workflowType === "base"
      ? currentTest.workflows.base
      : currentTest.workflows.test;

    const updatedWorkflow: ABTestWorkflowResult = {
      ...workflowResult,
      nodesCompleted,
      totalNodes
    };

    set({
      currentTest: {
        ...currentTest,
        workflows: {
          ...currentTest.workflows,
          [workflowType]: updatedWorkflow
        }
      }
    });
  },

  setComparison: (comparison) => {
    const currentTest = get().currentTest;
    if (!currentTest) return;
    set({
      currentTest: {
        ...currentTest,
        comparison
      }
    });
  },

  completeTest: () => {
    const currentTest = get().currentTest;
    if (!currentTest) return;

    const completedTest = {
      ...currentTest,
      status: "completed" as const,
      endTime: Date.now()
    };

    set((state) => ({
      currentTest: null,
      testHistory: [completedTest, ...state.testHistory]
    }));
  },

  getCurrentTest: () => get().currentTest,
  getTestHistory: () => get().testHistory,

  clearCurrentTest: () => set({ currentTest: null }),
  clearHistory: () => set({ testHistory: [] })
}));
