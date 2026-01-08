import { useCallback, useEffect, useMemo } from "react";

import { Node, Workflow } from "../../../stores/ApiTypes";
import {
  InputNodeData,
  MiniAppInputDefinition
} from "../types";
import { getInputKind } from "../utils";
import { useMiniAppsStore } from "../../../stores/MiniAppsStore";

export const useMiniAppInputs = (selectedWorkflow?: Workflow) => {
  const inputDefinitions = useMemo(() => {
    if (!selectedWorkflow?.graph?.nodes) {
      return [] as MiniAppInputDefinition[];
    }

    return (selectedWorkflow.graph.nodes || [])
      .map((node: Node) => {
        const kind = getInputKind(node.type);
        if (!kind) {
          return null;
        }

        return {
          nodeId: node.id,
          nodeType: node.type,
          kind,
          data: node.data as InputNodeData
        } satisfies MiniAppInputDefinition;
      })
      .filter(
        (definition): definition is MiniAppInputDefinition =>
          definition !== null
      );
  }, [selectedWorkflow]);

  const workflowId = selectedWorkflow?.id;

  const inputValues = useMiniAppsStore((state) =>
    workflowId ? state.apps[workflowId]?.inputValues ?? {} : {}
  );
  const initializeInputDefaults = useMiniAppsStore(
    (state) => state.initializeInputDefaults
  );
  const setInputValue = useMiniAppsStore((state) => state.setInputValue);

  useEffect(() => {
    if (!workflowId || inputDefinitions.length === 0) {
      return;
    }
    initializeInputDefaults(workflowId, inputDefinitions);
  }, [initializeInputDefaults, inputDefinitions, workflowId]);

  const updateInputValue = useCallback(
    (name: string, value: unknown) => {
      if (!workflowId) {
        return;
      }
      if (
        !inputDefinitions.some((definition) => definition.data.name === name)
      ) {
        return;
      }
      setInputValue(workflowId, name, value);
    },
    [inputDefinitions, setInputValue, workflowId]
  );

  return {
    inputDefinitions,
    inputValues,
    updateInputValue
  } as const;
};
