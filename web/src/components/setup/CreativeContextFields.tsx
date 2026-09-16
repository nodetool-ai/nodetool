import React, { memo, useCallback } from "react";

import type { CreativeContext } from "../../hooks/storyboard/productionContext";
import { Caption, FlexColumn, GAP, Text, TextInput } from "../ui_primitives";

export interface CreativeContextFieldsProps {
  value?: CreativeContext;
  onChange: (value: CreativeContext | undefined) => void;
}

type ContextField =
  | "product_name"
  | "product_description"
  | "audience"
  | "objective"
  | "tone"
  | "approved_claims"
  | "prohibited_claims";

const claimLines = (value: readonly string[] | undefined): string =>
  value?.join("\n") ?? "";

const toClaims = (value: string): string[] | undefined => {
  const claims = value
    .split("\n")
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0);
  return claims.length > 0 ? claims : undefined;
};

const hasContext = (context: CreativeContext): boolean =>
  context.product_name !== undefined ||
  context.product_description !== undefined ||
  context.audience !== undefined ||
  context.objective !== undefined ||
  context.tone !== undefined ||
  context.approved_claims !== undefined ||
  context.prohibited_claims !== undefined ||
  context.reference_bindings !== undefined;

const setField = (
  current: CreativeContext | undefined,
  field: ContextField,
  value: string
): CreativeContext | undefined => {
  const next: CreativeContext = {
    schema_version: 1,
    ...(current ?? {})
  };
  if (field === "approved_claims" || field === "prohibited_claims") {
    const claims = toClaims(value);
    if (claims) {
      next[field] = claims;
    } else {
      delete next[field];
    }
  } else if (value.trim().length > 0) {
    next[field] = value;
  } else {
    delete next[field];
  }
  return hasContext(next) ? next : undefined;
};

const CreativeContextFieldsInternal: React.FC<CreativeContextFieldsProps> = ({
  value,
  onChange
}) => {
  const update = useCallback(
    (field: ContextField) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(setField(value, field, event.target.value)),
    [onChange, value]
  );

  return (
    <FlexColumn gap={GAP.normal} component="section" aria-label="Creative context">
      <FlexColumn gap={GAP.micro}>
        <Text size="normal" component="h3">
          Creative context
        </Text>
        <Caption color="secondary">
          Optional product and audience details guide the plan. Only approved claims are treated as product facts.
        </Caption>
      </FlexColumn>
      <TextInput
        label="Product name"
        value={value?.product_name ?? ""}
        onChange={update("product_name")}
      />
      <TextInput
        label="Product description"
        value={value?.product_description ?? ""}
        multiline
        minRows={2}
        onChange={update("product_description")}
      />
      <TextInput label="Audience" value={value?.audience ?? ""} onChange={update("audience")} />
      <TextInput label="Objective" value={value?.objective ?? ""} onChange={update("objective")} />
      <TextInput label="Tone" value={value?.tone ?? ""} onChange={update("tone")} />
      <TextInput
        label="Approved claims"
        helperText="One claim per line"
        value={claimLines(value?.approved_claims)}
        multiline
        minRows={2}
        onChange={update("approved_claims")}
      />
      <TextInput
        label="Prohibited claims"
        helperText="One claim per line"
        value={claimLines(value?.prohibited_claims)}
        multiline
        minRows={2}
        onChange={update("prohibited_claims")}
      />
    </FlexColumn>
  );
};

export const CreativeContextFields = memo(CreativeContextFieldsInternal);
CreativeContextFields.displayName = "CreativeContextFields";

export default CreativeContextFields;
