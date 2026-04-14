import { useState, useMemo, useEffect, useCallback } from "react";
import { Workflow } from "../types/miniapp";
import { getInputKind } from "../utils/inputUtils";
import { Node } from "../types/ApiTypes";

import { MiniAppInputKind } from "../types/miniapp";

export interface InputNodeData {
  name: string;
  label?: string;
  description?: string;
  value?: unknown;
  min?: number;
  max?: number;
}

export interface MiniAppInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: MiniAppInputKind;
  data: InputNodeData;
}

export const useMiniAppInputs = (selectedWorkflow?: Workflow | null) => {
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});

  const inputDefinitions = useMemo(() => {
    // Mobile 'Workflow' type uses 'graph.nodes'
    if (!selectedWorkflow?.graph?.nodes) {
      return [] as MiniAppInputDefinition[];
    }

    return (selectedWorkflow.graph.nodes as Node[])
      .map((node: Node) => {
        const kind = getInputKind(node.type);
        if (!kind) {
          return null;
        }

        const nodeData = node.data as InputNodeData | undefined;
        return {
          nodeId: node.id,
          nodeType: node.type,
          kind,
          data: {
              ...nodeData,
              // Ensure name exists
              name: nodeData?.name || node.id,
              // Ensure label exists (fallback logic from original screen)
              label: nodeData?.label || nodeData?.name || 'Input'
          } as InputNodeData
        } satisfies MiniAppInputDefinition;
      })
      .filter(
        (definition): definition is MiniAppInputDefinition =>
          definition !== null
      );
  }, [selectedWorkflow]);

  // Initialize defaults
  useEffect(() => {
    if (!selectedWorkflow || inputDefinitions.length === 0) {
      return;
    }

    const initialValues: Record<string, unknown> = {};
    
    inputDefinitions.forEach((def) => {
        const key = def.data.name;
        // Only set if not already set (preserve user input during re-renders if any)
        if (inputValues[key] !== undefined) {return;}

        if (def.data.value !== undefined) {
            initialValues[key] = def.data.value;
        } else if (def.kind === 'boolean') {
            initialValues[key] = false;
        } else if (def.kind === 'integer' || def.kind === 'float') {
            initialValues[key] = def.data.min || 0;
        } else {
            initialValues[key] = '';
        }
    });

    if (Object.keys(initialValues).length > 0) {
        setInputValues(prev => ({ ...prev, ...initialValues }));
    }
  }, [inputDefinitions, selectedWorkflow, inputValues]); // Check dependencies carefully to avoid loops

  const updateInputValue = useCallback(
    (name: string, value: unknown) => {
      setInputValues((prev) => ({
        ...prev,
        [name]: value,
      }));
    },
    []
  );

  return {
    inputDefinitions,
    inputValues,
    updateInputValue,
    setInputValues, // Expose strict setter if needed
  };
};
