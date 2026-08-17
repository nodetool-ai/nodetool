/** @jsxImportSource @emotion/react */
/**
 * Applies the app layer's three declarative logic props — `visibleWhen`,
 * `disabledWhen`, and `format` — to any widget, in one place.
 *
 * This is the entire logic surface a mini app has. Anything beyond formatting
 * and visibility is a node in the graph, where it is testable and visible to
 * the agent.
 */
import React from "react";
import type { ConditionProps } from "@nodetool-ai/app-runtime";

import { Box } from "../../ui_primitives";
import {
  useAppRuntimeContext,
  useCondition,
  useFormatted
} from "../runtime/AppRuntimeContext";

interface ConditionalProps {
  visibleWhen?: ConditionProps;
  disabledWhen?: ConditionProps;
  /** `{binding|filter}` template rendered in place of the bound raw value. */
  format?: string;
}

/**
 * Wrap a widget so the runtime honors its conditional props. In the builder's
 * design canvas a hidden widget still renders (dimmed) — an author has to be
 * able to select what they just configured.
 */
// Puck's component props are intentionally loose (`DefaultComponents`): it
// injects `id`/`puck` at render time and our widgets take optional props, so
// the wrapper takes the conditional props it reads plus whatever else travels.
export type WrappedWidgetProps = ConditionalProps & {
  /** Puck injects a stable component id on every placed widget. */
  id: string;
} & Record<string, unknown>;

export const withConditions = (
  Widget: React.ComponentType<WrappedWidgetProps>
): ((props: WrappedWidgetProps) => React.ReactElement) => {
  const Wrapped = (props: WrappedWidgetProps): React.ReactElement => {
    const { designMode } = useAppRuntimeContext();
    const visible = useCondition(props.visibleWhen, true);
    const disabled = useCondition(props.disabledWhen, false);
    const formatted = useFormatted(props.format);

    // Puck's render contract wants an element, never null.
    if (!visible && !designMode) return <></>;

    const widget = (
      <Widget
        {...props}
        {...(formatted !== null ? { formattedValue: formatted } : {})}
        {...(disabled ? { disabled: true } : {})}
      />
    );

    if (visible && !disabled) return widget;
    return (
      <Box
        sx={{
          opacity: visible ? 0.5 : 0.35,
          pointerEvents: disabled ? "none" : undefined
        }}
        aria-disabled={disabled || undefined}
      >
        {widget}
      </Box>
    );
  };
  Wrapped.displayName = `withConditions(${Widget.displayName ?? Widget.name ?? "Widget"})`;
  return Wrapped;
};
