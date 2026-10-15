/** @jsxImportSource @emotion/react */
/**
 * NodeSlider
 *
 * Thin wrapper over {@link Slider} for node bodies and editor UI: compact
 * density by default, the ReactFlow `nodrag` class, and the `changed` flag
 * (neutral thumb until the value differs from its default). All look lives in
 * `Slider`.
 */

import { forwardRef, memo } from "react";
import { useEditorScope } from "../editor_ui";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { Slider, type SliderProps } from "./Slider";

export interface NodeSliderProps extends Omit<SliderProps, "size"> {
  className?: string;
  /** Value differs from default — shows visual indicator */
  changed?: boolean;
}

/**
 * @example
 * <NodeSlider value={value} onChange={(e, val) => onChange(val)} min={0} max={100} changed={hasChanged} />
 */
export const NodeSlider = forwardRef<HTMLSpanElement, NodeSliderProps>(
  ({ className, changed, density = "compact", ...props }, ref) => {
    // Kept for parity with other editor_ui primitives (scope-aware styling).
    useEditorScope();

    return (
      <Slider
        ref={ref}
        className={cn(editorClassNames.nodrag, className)}
        density={density}
        changed={!!changed}
        {...props}
      />
    );
  }
);

NodeSlider.displayName = "NodeSlider";

const NodeSliderMemo = memo(NodeSlider);
NodeSliderMemo.displayName = "NodeSlider";

export default NodeSliderMemo;
