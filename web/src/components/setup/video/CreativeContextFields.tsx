import { useEffect, useState } from "react";
import {
  creativeContext,
  type CreativeContext,
  type ProductionReferenceKind
} from "@nodetool-ai/protocol";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  SelectField,
  TextInput
} from "../../ui_primitives";
import { SETUP_FIELD_WIDTH } from "../layout";

interface CreativeContextFieldsProps {
  readonly value: CreativeContext | undefined;
  readonly onChange: (value: CreativeContext) => void;
  readonly onValidationChange?: (reason: string | undefined) => void;
}

const TEXT_FIELDS = [
  ["product_name", "Product name"],
  ["product_description", "Product description"],
  ["audience", "Audience"],
  ["objective", "Objective"],
  ["tone", "Tone"]
] as const;

interface ContextTextProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly multiline?: boolean;
}

// Remount on an external value change. While typing, keep spaces and blank lines.
const ContextText = ({
  label,
  value,
  onCommit,
  multiline
}: ContextTextProps) => {
  const [draft, setDraft] = useState(value);
  return (
    <TextInput
      label={label}
      value={draft}
      multiline={multiline}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
    />
  );
};

export default function CreativeContextFields({
  value,
  onChange,
  onValidationChange
}: CreativeContextFieldsProps) {
  const [pickerKind, setPickerKind] = useState<ProductionReferenceKind | null>(
    null
  );
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const error =
    invalidFields.length > 0
      ? "Context was not saved. Use at most 64 claims per list and 32 references."
      : undefined;
  useEffect(() => {
    onValidationChange?.(error);
    return () => onValidationChange?.(undefined);
  }, [error, onValidationChange]);
  const update = (patch: Partial<CreativeContext>): void => {
    const parsed = creativeContext.safeParse({ ...value, ...patch });
    const fields = Object.keys(patch);
    if (!parsed.success) {
      setInvalidFields((current) => [...new Set([...current, ...fields])]);
      return;
    }
    setInvalidFields((current) =>
      current.filter((field) => !fields.includes(field))
    );
    onChange(parsed.data);
  };
  return (
    <CollapsibleSection
      title="Creative context (optional)"
      defaultOpen={false}
      unmountOnExit
    >
      <FlexColumn gap={GAP.comfortable}>
        <Caption>
          Leave fields blank when they do not apply. Claims use one line per
          claim.
        </Caption>
        {TEXT_FIELDS.map(([key, label]) => (
          <ContextText
            key={`${key}:${value?.[key] ?? ""}`}
            label={label}
            value={value?.[key] ?? ""}
            multiline={key === "product_description"}
            onCommit={(text) => update({ [key]: text.trim() || undefined })}
          />
        ))}
        {(["approved_claims", "prohibited_claims"] as const).map((key) => (
          <ContextText
            key={`${key}:${value?.[key]?.join("\n") ?? ""}`}
            multiline
            label={
              key === "approved_claims"
                ? "Approved claims"
                : "Prohibited claims"
            }
            value={value?.[key]?.join("\n") ?? ""}
            onCommit={(text) =>
              update({
                [key]: text
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              })
            }
          />
        ))}
        <FlexRow gap={GAP.normal} wrap>
          {(["product", "character", "style"] as const).map((kind) => (
            <EditorButton
              key={kind}
              onClick={() => setPickerKind(kind)}
              disabled={(value?.reference_bindings?.length ?? 0) >= 32}
            >
              Add {kind} reference
            </EditorButton>
          ))}
        </FlexRow>
        {value?.reference_bindings?.map((reference, index) => (
          <FlexColumn
            key={`${reference.kind}:${reference.asset_id}:${index}`}
            gap={GAP.tight}
          >
            <ResponsiveImage
              locator={`asset://${reference.asset_id}`}
              alt={`${reference.kind} reference`}
              fit="contain"
              aspectRatio="1/1"
              showErrorFallback
              sx={{ maxWidth: SETUP_FIELD_WIDTH }}
            />
            <SelectField
              label={`Reference ${index + 1} role`}
              value={reference.kind}
              options={["product", "character", "location", "style"].map(
                (kind) => ({ value: kind, label: kind })
              )}
              onChange={(kind) => {
                const parsed = creativeContext.parse({
                  ...value,
                  reference_bindings: value.reference_bindings?.map(
                    (entry, position) =>
                      position === index ? { ...entry, kind } : entry
                  )
                });
                onChange(parsed);
              }}
            />
            <EditorButton
              onClick={() =>
                update({
                  reference_bindings: value.reference_bindings?.filter(
                    (_, position) => position !== index
                  )
                })
              }
            >
              Remove reference {index + 1}
            </EditorButton>
          </FlexColumn>
        ))}
        <Caption>
          Reference assets are included in reviewed production requests.
        </Caption>
        {error ? (
          <Caption role="alert" color="error">
            {error}
          </Caption>
        ) : null}
        {pickerKind ? (
          <EntityAssetPickerDialog
            open
            title={`Choose ${pickerKind} reference`}
            onClose={() => setPickerKind(null)}
            onPick={(assetId) => {
              update({
                reference_bindings: [
                  ...(value?.reference_bindings ?? []),
                  { kind: pickerKind, asset_id: assetId }
                ]
              });
              setPickerKind(null);
            }}
          />
        ) : null}
      </FlexColumn>
    </CollapsibleSection>
  );
}
