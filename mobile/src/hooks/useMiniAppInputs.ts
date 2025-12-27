import { useState, useMemo, useEffect, useCallback } from "react";
import { Workflow } from "../types/miniapp";
import { getInputKind } from "../utils/inputUtils";

import { MiniAppInputKind } from "../types/miniapp";

// Define these locally or import if I can find where they are in mobile
export interface InputNodeData {
  name: string;
  label?: string;
  description?: string;
  value?: any;
  min?: number;
  max?: number;
  [key: string]: any;
}

export interface MiniAppInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: MiniAppInputKind;
  data: InputNodeData;
}

export const useMiniAppInputs = (selectedWorkflow?: Workflow | null) => {
  const [inputValues, setInputValues] = useState<Record<string, any>>({});

  const inputDefinitions = useMemo(() => {
    // Mobile 'Workflow' type uses 'graph.nodes'
    if (!selectedWorkflow?.graph?.nodes) {
      return [] as MiniAppInputDefinition[];
    }

    return (selectedWorkflow.graph.nodes || [])
      .map((node: any) => {
        const kind = getInputKind(node.type);
        if (!kind) {
          return null;
        }

        return {
          nodeId: node.id,
          nodeType: node.type,
          kind,
          data: {
              ...node.data,
              // Ensure name exists
              name: node.data.name || node.id,
              // Ensure label exists (fallback logic from original screen)
              label: node.data.label || node.data.name || 'Input'
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

    const initialValues: Record<string, any> = {};
    
    inputDefinitions.forEach((def) => {
        const key = def.data.name;
        // Only set if not already set (preserve user input during re-renders if any)
        if (inputValues[key] !== undefined) return;

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
  }, [inputDefinitions, selectedWorkflow]); // Check dependencies carefully to avoid loops

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
