/**
 * useBespokePropertyWriter
 *
 * Bespoke editing-node bodies (ResizeBody, CropBody, …) write node params
 * outside `PropertyInput.onChange`, which is where the instant-update
 * auto-run hook is normally wired. Without this helper they would silently
 * break the instant-update feature for any node they replace.
 *
 * The hook returns a writer that both:
 *   - updates the node's properties via the NodeStore, and
 *   - notifies the auto-run hook so the downstream subgraph runs when
 *     instant-update is enabled.
 *
 * Use `setPropertyComplete` for slider drag-end / blur — it fires the
 * auto-run immediately. Use `setProperty` for intermediate updates;
 * the auto-run hook debounces.
 */
import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useNodeAutoRun } from "./useInputNodeAutoRun";

interface UseBespokePropertyWriterOptions {
  nodeId: string;
  nodeType: string;
}

interface UseBespokePropertyWriterReturn {
  setProperty: (name: string, value: unknown) => void;
  setProperties: (updates: Record<string, unknown>) => void;
  setPropertyComplete: () => void;
}

export const useBespokePropertyWriter = ({
  nodeId,
  nodeType
}: UseBespokePropertyWriterOptions): UseBespokePropertyWriterReturn => {
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  // The hook's per-property logging is informational; bespoke bodies often
  // write multiple props in one tick (e.g. Resize with chain-lock writes
  // width + height together), so we pass a single representative name.
  const { onPropertyChange, onPropertyChangeComplete } = useNodeAutoRun({
    nodeId,
    nodeType,
    propertyName: "bespoke"
  });

  const setProperty = useCallback(
    (name: string, value: unknown) => {
      updateNodeProperties(nodeId, { [name]: value });
      onPropertyChange();
    },
    [nodeId, onPropertyChange, updateNodeProperties]
  );

  const setProperties = useCallback(
    (updates: Record<string, unknown>) => {
      updateNodeProperties(nodeId, updates);
      onPropertyChange();
    },
    [nodeId, onPropertyChange, updateNodeProperties]
  );

  return {
    setProperty,
    setProperties,
    setPropertyComplete: onPropertyChangeComplete
  };
};

export default useBespokePropertyWriter;
