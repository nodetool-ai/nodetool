import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface ClaimsTextProps {
  readonly label: string;
  readonly helperText: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

// Parsing each keystroke would trim away spaces and new lines as they are
// typed, so keep a draft and commit it on blur or unmount.
const ClaimsText: React.FC<ClaimsTextProps> = ({
  label,
  helperText,
  value,
  onCommit
}) => {
  const [draft, setDraft] = useState(value);
  const pendingRef = useRef({ draft, value, onCommit });
  pendingRef.current = { draft, value, onCommit };
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (pending.draft !== pending.value) {
        pending.onCommit(pending.draft);
      }
    },
    []
  );
  return (
    <FlexColumn gap={GAP.micro}>
      <Label>{label}</Label>
      <TextInput
        label={label}
        hideLabel
        multiline
        rows={3}
        value={draft}
        helperText={helperText}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) {
            // The commit remounts this field, so unmount must not repeat it.
            pendingRef.current.value = draft;
            onCommit(draft);
          }
        }}
      />
    </FlexColumn>
  );
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
      <ClaimsText
        key={`approved:${listValue(context.approved_claims)}`}
        label="Approved claims"
        helperText="One approved fact per line."
        value={listValue(context.approved_claims)}
        onCommit={(text) => update({ approved_claims: listFromValue(text) })}
      />
      <ClaimsText
        key={`prohibited:${listValue(context.prohibited_claims)}`}
        label="Prohibited claims"
        helperText="One claim to avoid per line."
        value={listValue(context.prohibited_claims)}
        onCommit={(text) => update({ prohibited_claims: listFromValue(text) })}
      />
    </FlexColumn>
  );
};

export default ScriptCreativeContextFields;
