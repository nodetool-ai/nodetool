/**
 * The declared input/output ports of a JS script: one row per port with its
 * name and NodeTool type, plus add and remove. A script declares its ports
 * rather than inheriting them from a graph, so this is the only place they
 * come from — everything downstream (the run dialog, test cases, validation)
 * reads what is declared here.
 */
import { memo, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";

import {
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  SelectField,
  Text,
  TextInput,
  DeleteButton,
  SPACING
} from "../ui_primitives";
import type { JsScriptPort } from "../../stores/jsScript/JsScriptStore";

/** The types a script port can carry, as the type system names them. */
const PORT_TYPES = [
  "str",
  "int",
  "float",
  "bool",
  "list",
  "dict",
  "image",
  "audio",
  "video",
  "document",
  "any"
] as const;

const TYPE_OPTIONS = PORT_TYPES.map((type) => ({ value: type, label: type }));

interface JsScriptPortsEditorProps {
  label: string;
  ports: readonly JsScriptPort[];
  readOnly?: boolean;
  onChange: (ports: JsScriptPort[]) => void;
}

const JsScriptPortsEditor = ({
  label,
  ports,
  readOnly = false,
  onChange
}: JsScriptPortsEditorProps) => {
  const patch = useCallback(
    (index: number, next: Partial<JsScriptPort>) => {
      onChange(
        ports.map((port, i) => (i === index ? { ...port, ...next } : port))
      );
    },
    [onChange, ports]
  );

  const remove = useCallback(
    (index: number) => {
      onChange(ports.filter((_, i) => i !== index));
    },
    [onChange, ports]
  );

  const add = useCallback(() => {
    onChange([...ports, { name: "", type: "str" }]);
  }, [onChange, ports]);

  return (
    <FlexColumn gap={SPACING.sm}>
      <FlexRow align="center" justify="space-between">
        <Label>{label}</Label>
        {!readOnly && (
          <EditorButton
            density="compact"
            startIcon={<AddIcon fontSize="small" />}
            onClick={add}
          >
            Add
          </EditorButton>
        )}
      </FlexRow>
      {ports.length === 0 ? (
        <Text size="small" color="secondary">
          None declared.
        </Text>
      ) : (
        ports.map((port, index) => (
          <FlexRow key={index} gap={SPACING.sm} align="center">
            <TextInput
              label={`${label} ${index + 1} name`}
              hideLabel
              size="small"
              value={port.name}
              placeholder="name"
              disabled={readOnly}
              onChange={(event) => patch(index, { name: event.target.value })}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Box sx={{ width: 110, flexShrink: 0 }}>
              <SelectField
                label={`${label} ${index + 1} type`}
                hideLabel
                size="small"
                value={port.type}
                options={TYPE_OPTIONS}
                disabled={readOnly}
                onChange={(value) => patch(index, { type: value })}
              />
            </Box>
            {!readOnly && (
              <DeleteButton
                ariaLabel={`Remove ${label} ${index + 1}`}
                onClick={() => remove(index)}
              />
            )}
          </FlexRow>
        ))
      )}
    </FlexColumn>
  );
};

export default memo(JsScriptPortsEditor);
