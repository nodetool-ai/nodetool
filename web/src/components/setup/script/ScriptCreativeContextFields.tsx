import React, { useCallback, useMemo } from "react";
import type { CreativeContext } from "@nodetool-ai/protocol";

import {
  Caption,
  FlexColumn,
  GAP,
  Label,
  Text,
  TextInput
} from "../../ui_primitives";

export interface ScriptCreativeContextFieldsProps {
  value?: CreativeContext;
  onChange: (value: CreativeContext | undefined) => void;
}

const listValue = (values: readonly string[] | undefined): string =>
  values?.join("\n") ?? "";

const listFromValue = (value: string): string[] | undefined => {
  const values = value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
};

const TEXT_FIELDS = [
  ["product_name", "Product name", "Optional name used in production direction."],
  [
    "product_description",
    "Product description",
    "What the product looks like or does."
  ],
  ["audience", "Audience", "Who this script is for."],
  ["objective", "Objective", "What the video should achieve."],
  ["tone", "Tone", "The desired delivery and mood."]
] as const;

export const ScriptCreativeContextFields: React.FC<
  ScriptCreativeContextFieldsProps
> = ({ value, onChange }) => {
  const context = useMemo<CreativeContext>(
    () => value ?? ({ schema_version: 1 } as CreativeContext),
    [value]
  );
  const update = useCallback(
    (patch: Partial<CreativeContext>) => {
      const next: CreativeContext = { ...context, ...patch };
      const hasValue = Object.entries(next).some(
        ([key, item]) => key !== "schema_version" && item !== undefined
      );
      onChange(hasValue ? next : undefined);
    },
    [context, onChange]
  );
  return (
    <FlexColumn
      gap={GAP.normal}
      component="section"
      aria-label="Production context"
    >
      <FlexColumn gap={GAP.micro}>
        <Text size="normal" weight={600} component="h3">
          Production context
        </Text>
        <Caption color="secondary" component="p">
          Optional context for visual production. The script still owns its words.
        </Caption>
      </FlexColumn>
      {TEXT_FIELDS.map(([key, label, helperText]) => (
        <TextInput
          key={key}
          label={label}
          value={typeof context[key] === "string" ? context[key] : ""}
          helperText={helperText}
          onChange={(event) =>
            update({
              [key]:
                event.target.value.trim().length > 0
                  ? event.target.value
                  : undefined
            })
          }
        />
      ))}
      <FlexColumn gap={GAP.micro}>
        <Label>Approved claims</Label>
        <TextInput
          label="Approved claims"
          hideLabel
          multiline
          rows={3}
          value={listValue(context.approved_claims)}
          helperText="One approved fact per line."
          onChange={(event) =>
            update({ approved_claims: listFromValue(event.target.value) })
          }
        />
      </FlexColumn>
      <FlexColumn gap={GAP.micro}>
        <Label>Prohibited claims</Label>
        <TextInput
          label="Prohibited claims"
          hideLabel
          multiline
          rows={3}
          value={listValue(context.prohibited_claims)}
          helperText="One claim to avoid per line."
          onChange={(event) =>
            update({ prohibited_claims: listFromValue(event.target.value) })
          }
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default ScriptCreativeContextFields;
