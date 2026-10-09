import { useEffect, useRef, useState } from "react";
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
import { GalleryFrame } from "../MediaGallery";

interface CreativeContextFieldsProps {
  readonly value: CreativeContext | undefined;
  readonly onChange: (value: CreativeContext) => void;
  readonly onValidationChange?: (reason: string | undefined) => void;
  /** Blocks every edit and commit. The section still opens and closes. */
  readonly readOnly?: boolean;
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
  /** Checks each keystroke, so an invalid draft blocks the step before commit. */
  readonly onDraft: (value: string) => void;
  /** The field shows the stored value again, so its old draft no longer counts. */
  readonly onMountFromStored: () => void;
  readonly multiline?: boolean;
  readonly readOnly: boolean;
}

// Remount on an external value change. While typing, keep spaces and blank lines.
const ContextText = ({
  label,
  value,
  onCommit,
  onDraft,
  onMountFromStored,
  multiline,
  readOnly
}: ContextTextProps) => {
  const [draft, setDraft] = useState(value);
  const onMountRef = useRef(onMountFromStored);
  useEffect(() => {
    onMountRef.current();
  }, []);
  // Cmd+Enter advances the step without moving focus, so the field unmounts
  // without a blur. Commit what was typed on the way out.
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
    <TextInput
      label={label}
      value={draft}
      multiline={multiline}
      inputProps={{ readOnly }}
      onChange={(event) => {
        if (readOnly) {
          return;
        }
        setDraft(event.target.value);
        onDraft(event.target.value);
      }}
      onBlur={() => {
        if (!readOnly) {
          onCommit(draft);
        }
      }}
    />
  );
};

const textPatch = (
  key: (typeof TEXT_FIELDS)[number][0],
  text: string
): Partial<CreativeContext> => ({ [key]: text.trim() || undefined });

const claimsPatch = (
  key: "approved_claims" | "prohibited_claims",
  text: string
): Partial<CreativeContext> => ({
  [key]: text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
});

export default function CreativeContextFields({
  value,
  onChange,
  onValidationChange,
  readOnly = false
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
  const clearInvalid = (fields: readonly string[]): void =>
    setInvalidFields((current) =>
      current.some((field) => fields.includes(field))
        ? current.filter((field) => !fields.includes(field))
        : current
    );
  const validate = (patch: Partial<CreativeContext>) => {
    const parsed = creativeContext.safeParse({ ...value, ...patch });
    const fields = Object.keys(patch);
    if (!parsed.success) {
      setInvalidFields((current) =>
        fields.every((field) => current.includes(field))
          ? current
          : [...new Set([...current, ...fields])]
      );
      return null;
    }
    clearInvalid(fields);
    return parsed.data;
  };
  const update = (patch: Partial<CreativeContext>): void => {
    if (readOnly) {
      return;
    }
    const parsed = validate(patch);
    if (parsed === null) {
      return;
    }
    // A blank field left on a board with no context says nothing. Writing it
    // would create an empty context, which counts as production context and
    // holds generation until the plan is reviewed again.
    const blank = Object.values(patch).every(
      (entry) =>
        entry === undefined || (Array.isArray(entry) && entry.length === 0)
    );
    if (value === undefined && blank) {
      return;
    }
    onChange(parsed);
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
            readOnly={readOnly}
            onCommit={(text) => update(textPatch(key, text))}
            onDraft={(text) => validate(textPatch(key, text))}
            onMountFromStored={() => clearInvalid([key])}
          />
        ))}
        {(["approved_claims", "prohibited_claims"] as const).map((key) => (
          <ContextText
            key={`${key}:${value?.[key]?.join("\n") ?? ""}`}
            multiline
            readOnly={readOnly}
            label={
              key === "approved_claims"
                ? "Approved claims"
                : "Prohibited claims"
            }
            value={value?.[key]?.join("\n") ?? ""}
            onCommit={(text) => update(claimsPatch(key, text))}
            onDraft={(text) => validate(claimsPatch(key, text))}
            onMountFromStored={() => clearInvalid([key])}
          />
        ))}
        <FlexRow gap={GAP.normal} wrap>
          {(["product", "character", "style"] as const).map((kind) => (
            <EditorButton
              key={kind}
              onClick={() => setPickerKind(kind)}
              disabled={
                readOnly || (value?.reference_bindings?.length ?? 0) >= 32
              }
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
            <GalleryFrame
              locator={`asset://${reference.asset_id}`}
              kind="image"
              caption={`${reference.kind} reference`}
              sx={{ width: "100%", maxWidth: SETUP_FIELD_WIDTH }}
            >
              <ResponsiveImage
                locator={`asset://${reference.asset_id}`}
                alt={`${reference.kind} reference`}
                fit="contain"
                aspectRatio="1/1"
                showErrorFallback
              />
            </GalleryFrame>
            <SelectField
              label={`Reference ${index + 1} role`}
              value={reference.kind}
              disabled={readOnly}
              options={["product", "character", "location", "style"].map(
                (kind) => ({ value: kind, label: kind })
              )}
              onChange={(kind) => {
                if (readOnly) {
                  return;
                }
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
              disabled={readOnly}
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
        {pickerKind && !readOnly ? (
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
