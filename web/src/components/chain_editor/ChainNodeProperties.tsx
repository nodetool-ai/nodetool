/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Switch, TextField } from "@mui/material";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { FlexRow } from "../ui_primitives/FlexRow";
import { Text } from "../ui_primitives/Text";
import { Chip } from "../ui_primitives/Chip";
import type { Property } from "../../stores/ApiTypes";

interface ChainNodePropertiesProps {
  properties: Property[];
  values: Record<string, unknown>;
  connectedInput: string | null;
  onUpdate: (name: string, value: unknown) => void;
}

function getWidgetType(prop: Property): string {
  if (prop.type.values && prop.type.values.length > 0) return "enum";
  const t = prop.type.type;
  if (t === "str" || t === "string") return "string";
  if (t === "int" || t === "integer") return "integer";
  if (t === "float" || t === "number") return "float";
  if (t === "bool" || t === "boolean") return "boolean";
  return "string";
}

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  properties, values, connectedInput, onUpdate,
}) => {
  const theme = useTheme();

  const renderProperty = useCallback(
    (prop: Property) => {
      const isConnected = prop.name === connectedInput;
      const value = values[prop.name] ?? prop.default;
      const widget = getWidgetType(prop);

      return (
        <FlexColumn key={prop.name} gap={0.5}>
          <FlexRow gap={0.75} align="center">
            <Text size="small" weight={600}>{prop.title ?? prop.name}</Text>
            {prop.required && <Text size="small" weight={700} color="error">*</Text>}
            {isConnected && (
              <Chip label="connected" color="secondary" compact size="small" />
            )}
          </FlexRow>

          {prop.description && !isConnected && (
            <Text size="tiny" color="secondary" lineClamp={2}>{prop.description}</Text>
          )}

          {isConnected ? (
            <Box
              sx={{
                p: 1.25,
                borderRadius: 1,
                border: `1px dashed ${theme.vars.palette.secondary.main}40`,
                backgroundColor: `${theme.vars.palette.secondary.main}08`,
              }}
            >
              <Text size="smaller" color="secondary" sx={{ fontStyle: "italic" }}>
                Value provided by previous node
              </Text>
            </Box>
          ) : (
            <>
              {widget === "string" && (
                <TextField
                  size="small"
                  fullWidth
                  multiline={String(value ?? "").length > 60}
                  minRows={1}
                  maxRows={6}
                  value={String(value ?? "")}
                  onChange={(e) => onUpdate(prop.name, e.target.value)}
                  placeholder={prop.description ?? `Enter ${prop.title ?? prop.name}`}
                />
              )}
              {(widget === "integer" || widget === "float") && (
                <FlexRow gap={1} align="center">
                  <TextField
                    size="small"
                    type="number"
                    value={String(value ?? "")}
                    onChange={(e) => {
                      const v = widget === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                      if (!isNaN(v)) onUpdate(prop.name, v);
                      else if (e.target.value === "") onUpdate(prop.name, "");
                    }}
                    sx={{ flex: 1 }}
                    slotProps={{
                      htmlInput: {
                        min: prop.min ?? undefined,
                        max: prop.max ?? undefined,
                        step: widget === "float" ? 0.1 : 1,
                      },
                    }}
                  />
                  {prop.min != null && prop.max != null && (
                    <Text size="tiny" color="secondary">{prop.min} – {prop.max}</Text>
                  )}
                </FlexRow>
              )}
              {widget === "boolean" && (
                <Switch
                  size="small"
                  checked={Boolean(value)}
                  onChange={(_, v) => onUpdate(prop.name, v)}
                />
              )}
              {widget === "enum" && (
                <FlexRow gap={0.75} wrap>
                  {(prop.type.values ?? []).map((opt: string | number) => {
                    const isSelected = String(value) === String(opt);
                    return (
                      <Chip
                        key={String(opt)}
                        label={String(opt)}
                        color={isSelected ? "primary" : "default"}
                        active={isSelected}
                        onClick={() => onUpdate(prop.name, opt)}
                        size="small"
                      />
                    );
                  })}
                </FlexRow>
              )}
            </>
          )}
        </FlexColumn>
      );
    },
    [theme, values, connectedInput, onUpdate]
  );

  if (properties.length === 0) {
    return (
      <Box sx={{ py: 1.5, textAlign: "center" }}>
        <Text size="smaller" color="secondary" sx={{ fontStyle: "italic" }}>
          No configurable properties
        </Text>
      </Box>
    );
  }

  return <FlexColumn gap={2}>{properties.map(renderProperty)}</FlexColumn>;
};
