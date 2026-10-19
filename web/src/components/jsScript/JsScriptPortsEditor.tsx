/**
 * The declared input/output ports of a JS script: one row per port with its
 * name and NodeTool type, plus add and remove. A script declares its ports
 * rather than inheriting them from a graph, so this is the only place they
 * come from — everything downstream (the run dialog, test cases, validation)
 * reads what is declared here.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";

import {
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  SectionHeader,
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
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
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
      <SectionHeader
        size="small"
        title={label}
        action={
          readOnly ? undefined : (
            <EditorButton
              density="compact"
              startIcon={<AddIcon />}
              onClick={add}
            >
              {t("actions.add")}
            </EditorButton>
          )
        }
      />
      {ports.length === 0 ? (
        <Text size="small" color="secondary">
          {t("ports.noneDeclared")}
        </Text>
      ) : (
        ports.map((port, index) => (
          <FlexRow key={index} gap={SPACING.sm} align="center">
            <TextInput
              label={t("ports.fieldName", { label, number: index + 1 })}
              hideLabel
              size="small"
              value={port.name}
              placeholder={t("ports.namePlaceholder")}
              disabled={readOnly}
              onChange={(event) => patch(index, { name: event.target.value })}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Box sx={{ width: 110, flexShrink: 0 }}>
              <SelectField
                label={t("ports.fieldType", { label, number: index + 1 })}
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
                ariaLabel={t("ports.delete", { label, number: index + 1 })}
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
