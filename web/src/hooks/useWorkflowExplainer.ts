import { useCallback, useState } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";

export interface WorkflowExplanationStep {
  order: number;
  nodeId: string;
  nodeType: string;
  description: string;
  inputs: string[];
  outputs: string[];
}

export interface WorkflowExplanation {
  summary: string;
  steps: WorkflowExplanationStep[];
  dataFlow: string[];
  potentialIssues: string[];
}

export const useWorkflowExplainer = () => {
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState<WorkflowExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useGlobalChatStore((state) => state.sendMessage);

  const explainWorkflow = useCallback(async () => {
    setIsExplaining(true);
    setError(null);

    try {
      await sendMessage({
        type: "message",
        name: "workflow_explainer",
        role: "user",
        content: [
          {
            type: "text",
            text: "Please explain what the current workflow does. Use the ui_explain_workflow tool to analyze it and provide a detailed step-by-step explanation."
          }
        ],
        agent_mode: false,
        help_mode: false
      });

      setExplanation({
        summary: "Analysis requested...",
        steps: [],
        dataFlow: [],
        potentialIssues: []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to explain workflow");
      console.error("Error explaining workflow:", err);
    } finally {
      setIsExplaining(false);
    }
  }, [sendMessage]);

  const clearExplanation = useCallback(() => {
    setExplanation(null);
    setError(null);
  }, []);

  return {
    isExplaining,
    explanation,
    error,
    explainWorkflow,
    clearExplanation
  };
};
