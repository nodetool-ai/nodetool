import { useCallback } from "react";
import { devError } from "../../utils/DevLog";
import {
  extractWorkflowFromPng,
  isComfyWorkflowJson,
  isNodetoolWorkflowJson
} from "./dropHandlerUtils";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useNodes } from "../../contexts/NodeContext";

export const useCreateWorkflowFromFiles = () => {
  const createWorkflow = useWorkflowStore((state) => state.create);
  const setWorkflow = useNodes((state) => state.setWorkflow);

  return useCallback(
    async (files: File[]) => {
      const nonJsonFiles: File[] = [];

      for (const file of files) {
        if (file.type === "image/png") {
          const workflow = await extractWorkflowFromPng(file);
          if (workflow) {
            try {
              const createdWorkflow = await createWorkflow({
                name: file.name,
                description: "created from comfy",
                access: "private",
                comfy_workflow: workflow
              });
              setWorkflow(createdWorkflow);
            } catch (error: any) {
              alert(error.detail);
            }
          } else {
            nonJsonFiles.push(file);
          }
        } else if (file.type === "application/json") {
          const jsonContent = await file.text();
          try {
            const jsonWorkflow = JSON.parse(jsonContent);
            if (isComfyWorkflowJson(jsonWorkflow)) {
              const createdWorkflow = await createWorkflow({
                name: file.name,
                description: "created from comfy",
                access: "private",
                comfy_workflow: jsonWorkflow
              });
              setWorkflow(createdWorkflow);
            } else if (isNodetoolWorkflowJson(jsonWorkflow)) {
              const createdWorkflow = await createWorkflow({
                name: jsonWorkflow.name,
                description: "created from json",
                access: "private",
                graph: jsonWorkflow.graph
              });
              setWorkflow(createdWorkflow);
            } else {
              nonJsonFiles.push(file);
            }
          } catch (error) {
            devError("Error parsing JSON", error);
            nonJsonFiles.push(file);
          }
        } else {
          nonJsonFiles.push(file);
        }
      }

      return nonJsonFiles;
    },
    [createWorkflow, setWorkflow]
  );
};
