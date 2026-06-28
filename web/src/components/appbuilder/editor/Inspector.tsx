/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";

import { Workflow } from "../../../stores/ApiTypes";
import { useAppBuilderStore } from "../../../stores/AppBuilderStore";
import { extractWorkflowIO } from "../workflowIO";
import { getWidgetDefinition } from "../widgets/registry";
import { InspectorField } from "../widgets/types";
import {
  AppAction,
  AppEvent,
  Widget,
  WidgetPropValue
} from "../appSchema";
import {
  Box,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  TextInput,
  SelectField,
  LabeledSwitch,
  EditorButton,
  DeleteButton,
  Divider,
  EmptyState,
  BORDER_RADIUS
} from "../../ui_primitives";

interface InspectorProps {
  workflow: Workflow;
}

const PropFieldEditor: React.FC<{
  field: InspectorField;
  value: WidgetPropValue | undefined;
  onChange: (value: WidgetPropValue) => void;
}> = ({ field, value, onChange }) => {
  switch (field.type) {
    case "boolean":
      return (
        <LabeledSwitch
          label={field.label}
          checked={Boolean(value)}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <TextInput
          label={field.label}
          type="number"
          size="small"
          fullWidth
          value={value == null ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value))
          }
        />
      );
    case "select":
      return (
        <SelectField
          label={field.label}
          value={value == null ? "" : String(value)}
          options={field.options ?? []}
          onChange={onChange}
        />
      );
    case "color":
      return (
        <FlexColumn gap={0.25}>
          <Caption color="secondary">{field.label}</Caption>
          <Box
            component="input"
            type="color"
            value={typeof value === "string" ? value : "#000000"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            sx={{ width: 48, height: 28, border: "none", background: "none" }}
          />
        </FlexColumn>
      );
    case "multiline":
      return (
        <TextInput
          label={field.label}
          multiline
          minRows={3}
          size="small"
          fullWidth
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "text":
    default:
      return (
        <TextInput
          label={field.label}
          size="small"
          fullWidth
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
};

const ACTION_OPTIONS = [
  { label: "Run workflow", value: "run" },
  { label: "Cancel run", value: "cancel" },
  { label: "Set state", value: "setState" },
  { label: "Toggle state", value: "toggleState" }
];

const describeAction = (action: AppAction): string => action.kind;

const EventEditor: React.FC<{
  widget: Widget;
  onChange: (events: AppEvent[]) => void;
}> = ({ widget, onChange }) => {
  const definition = getWidgetDefinition(widget.type);
  const trigger = definition?.defaultTrigger;
  const events = widget.events ?? [];

  if (!trigger) return null;

  const addEvent = () => {
    onChange([...events, { trigger, action: { kind: "run" } }]);
  };

  const updateAction = (index: number, action: AppAction) => {
    onChange(events.map((e, i) => (i === index ? { ...e, action } : e)));
  };

  const removeEvent = (index: number) => {
    onChange(events.filter((_, i) => i !== index));
  };

  return (
    <FlexColumn gap={1}>
      <FlexRow align="center" justify="space-between">
        <Caption color="secondary">
          On {trigger === "click" ? "click" : "change"}
        </Caption>
        <EditorButton
          size="small"
          variant="text"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={addEvent}
        >
          Add action
        </EditorButton>
      </FlexRow>
      {events.length === 0 && (
        <Caption color="secondary">No actions yet.</Caption>
      )}
      {events.map((event, index) => (
        <FlexColumn
          key={index}
          gap={0.75}
          sx={{
            p: 1,
            borderRadius: BORDER_RADIUS.sm,
            border: "1px solid",
            borderColor: "divider"
          }}
        >
          <FlexRow align="center" gap={1}>
            <Box sx={{ flex: 1 }}>
              <SelectField
                label="Action"
                value={event.action.kind}
                options={ACTION_OPTIONS}
                onChange={(kind) => {
                  const next: AppAction =
                    kind === "setState"
                      ? { kind: "setState", key: "", value: "" }
                      : kind === "toggleState"
                        ? { kind: "toggleState", key: "" }
                        : kind === "cancel"
                          ? { kind: "cancel" }
                          : { kind: "run" };
                  updateAction(index, next);
                }}
              />
            </Box>
            <DeleteButton onClick={() => removeEvent(index)} />
          </FlexRow>
          {(event.action.kind === "setState" ||
            event.action.kind === "toggleState") && (
            <TextInput
              label="State key"
              size="small"
              fullWidth
              value={event.action.key}
              onChange={(e) =>
                updateAction(index, { ...event.action, key: e.target.value } as AppAction)
              }
            />
          )}
          {event.action.kind === "setState" && (
            <TextInput
              label="Value"
              size="small"
              fullWidth
              value={String(event.action.value ?? "")}
              onChange={(e) =>
                updateAction(index, {
                  kind: "setState",
                  key: (event.action as { key: string }).key,
                  value: e.target.value
                })
              }
            />
          )}
        </FlexColumn>
      ))}
      <Caption color="secondary">
        {events.map((e) => describeAction(e.action)).join(", ")}
      </Caption>
    </FlexColumn>
  );
};

const Inspector: React.FC<InspectorProps> = ({ workflow }) => {
  const selectedId = useAppBuilderStore((s) => s.selectedWidgetId);
  const widget = useAppBuilderStore((s) =>
    s.spec.widgets.find((w) => w.id === s.selectedWidgetId)
  );
  const setProp = useAppBuilderStore((s) => s.setProp);
  const setBinding = useAppBuilderStore((s) => s.setBinding);
  const setEvents = useAppBuilderStore((s) => s.setEvents);

  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);

  const bindingOptions = useMemo(() => {
    if (!widget) return [];
    const definition = getWidgetDefinition(widget.type);
    const opts: { label: string; value: string }[] = [
      { label: "— none —", value: "" }
    ];
    if (definition?.bindingMode === "write") {
      for (const input of io.inputs) {
        opts.push({ label: `input · ${input.label}`, value: input.name });
      }
    } else if (definition?.bindingMode === "read") {
      for (const output of io.outputs) {
        opts.push({ label: `output · ${output.label}`, value: output.name });
      }
      for (const input of io.inputs) {
        opts.push({ label: `input · ${input.label}`, value: input.name });
      }
    }
    return opts;
  }, [io, widget]);

  if (!selectedId || !widget) {
    return (
      <Box sx={{ p: 2, height: "100%" }}>
        <EmptyState
          title="No selection"
          description="Select a widget to edit its properties, data binding, and events."
        />
      </Box>
    );
  }

  const definition = getWidgetDefinition(widget.type);

  return (
    <FlexColumn gap={1.5} sx={{ p: 1.5, height: "100%", overflow: "auto" }}>
      <Text size="small" weight={600}>
        {definition?.label ?? widget.type}
      </Text>

      {/* Data binding */}
      {definition && definition.bindingMode !== "none" && (
        <FlexColumn gap={0.75}>
          <Caption
            color="secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Data binding
          </Caption>
          <SelectField
            label="Bind to"
            value={widget.binding ?? ""}
            options={bindingOptions}
            onChange={(value) =>
              setBinding(widget.id, value === "" ? undefined : value)
            }
          />
          <TextInput
            label="Custom key"
            size="small"
            fullWidth
            value={widget.binding ?? ""}
            placeholder="state key"
            onChange={(e) =>
              setBinding(
                widget.id,
                e.target.value === "" ? undefined : e.target.value
              )
            }
          />
        </FlexColumn>
      )}

      {/* Static props */}
      {definition && definition.inspector.length > 0 && (
        <>
          <Divider />
          <FlexColumn gap={1}>
            <Caption
              color="secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Properties
            </Caption>
            {definition.inspector.map((field) => (
              <PropFieldEditor
                key={field.key}
                field={field}
                value={widget.props[field.key]}
                onChange={(value) => setProp(widget.id, field.key, value)}
              />
            ))}
          </FlexColumn>
        </>
      )}

      {/* Events */}
      {definition?.defaultTrigger && (
        <>
          <Divider />
          <FlexColumn gap={1}>
            <Caption
              color="secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Events
            </Caption>
            <EventEditor
              widget={widget}
              onChange={(events) => setEvents(widget.id, events)}
            />
          </FlexColumn>
        </>
      )}
    </FlexColumn>
  );
};

export default Inspector;
