/**
 * Renders a single widget against the live runtime: resolves its bound value,
 * wires writes back into state, and turns interactions into dispatched actions.
 */
import React, { useCallback, useMemo } from "react";

import { EventTrigger, Widget, WidgetPropValue } from "./appSchema";
import {
  useAppRuntimeContext,
  useRuntimeValue,
  useRuntimeSelector
} from "./runtime/AppRuntimeContext";
import { getWidgetDefinition } from "./widgets/registry";
import { WidgetRenderContext } from "./widgets/types";
import { Text } from "../ui_primitives";

interface RuntimeWidgetProps {
  widget: Widget;
}

const RuntimeWidget: React.FC<RuntimeWidgetProps> = ({ widget }) => {
  const { designMode, dispatch, setValue } = useAppRuntimeContext();
  const value = useRuntimeValue(widget.binding);
  const runnerState = useRuntimeSelector((s) => s.runnerState);

  const definition = getWidgetDefinition(widget.type);

  const emit = useCallback(
    (trigger: EventTrigger) => {
      for (const event of widget.events ?? []) {
        if (event.trigger === trigger) {
          dispatch(event.action);
        }
      }
    },
    [dispatch, widget.events]
  );

  const writeValue = useCallback(
    (next: unknown) => {
      if (widget.binding) setValue(widget.binding, next);
    },
    [setValue, widget.binding]
  );

  const ctx = useMemo<WidgetRenderContext>(
    () => ({
      widget,
      props: widget.props,
      prop: <T extends WidgetPropValue>(key: string, fallback: T): T => {
        const v = widget.props[key];
        return (v === undefined || v === null ? fallback : v) as T;
      },
      value,
      setValue: writeValue,
      emit,
      designMode,
      runnerState
    }),
    [designMode, emit, runnerState, value, widget, writeValue]
  );

  if (!definition) {
    return <Text color="error">Unknown widget: {widget.type}</Text>;
  }

  return <>{definition.render(ctx)}</>;
};

export default React.memo(RuntimeWidget);
