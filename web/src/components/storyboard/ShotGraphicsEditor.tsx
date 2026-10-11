import React from "react";
import {
  resolveEffectiveProductionRequirement,
  type Shot
} from "@nodetool-ai/protocol";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  SelectField,
  SPACING,
  TextInput
} from "../ui_primitives";
import type { ShotDraft } from "./shotDraft";

interface ShotGraphicsEditorProps {
  shot: Shot;
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  readOnly?: boolean;
}

export default function ShotGraphicsEditor({
  shot,
  draft,
  onChange,
  readOnly
}: ShotGraphicsEditorProps): React.ReactElement {
  const production = resolveEffectiveProductionRequirement(
    undefined,
    shot.production
  );
  const graphics = draft.graphics;
  const patchElement = (
    id: string,
    patch: Partial<
      NonNullable<NonNullable<Shot["graphics"]>["elements"]>[number]
    >
  ): void => {
    if (readOnly || !graphics) { return; }
    onChange({
      ...draft,
      graphics: {
        ...graphics,
        elements: graphics.elements?.map((element) =>
          element.id === id ? { ...element, ...patch } : element
        )
      }
    });
  };
  return (
    <FlexColumn gap={SPACING.sm}>
      <Label>Graphics</Label>
      {!graphics ? (
        <EditorButton
          disabled={readOnly}
          onClick={() =>
            onChange({ ...draft, graphics: { mode: "overlay", elements: [] } })
          }
        >
          Add graphics intent
        </EditorButton>
      ) : (
        <>
          <SelectField
            label="Composition mode"
            value={graphics.mode ?? "overlay"}
            disabled={readOnly}
            options={[
              { value: "none", label: "None" },
              { value: "overlay", label: "Overlay" },
              { value: "graphics_first", label: "Graphics first" },
              { value: "hybrid", label: "Hybrid" }
            ]}
            onChange={(value) => {
              if (
                value === "none" ||
                value === "overlay" ||
                value === "graphics_first" ||
                value === "hybrid"
              ) {
                onChange({ ...draft, graphics: { ...graphics, mode: value } });
              }
            }}
          />
          <TextInput
            label="Graphic direction"
            multiline
            value={graphics.direction ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                ...draft,
                graphics: { ...graphics, direction: event.target.value }
              })
            }
          />
          {(graphics.elements ?? []).map((element) => {
            const protection = production?.protected_inputs?.find(
              (input) => input.id === element.protected_input_id
            );
            return (
              <FlexColumn key={element.id} gap={SPACING.xs}>
                <Caption>
                  {element.role ?? element.kind}: {element.id}
                </Caption>
                {element.kind === "text" && (
                  <TextInput
                    label={`Exact text: ${element.id}`}
                    value={
                      protection?.kind === "exact_text"
                        ? (protection.value ?? "")
                        : (element.text ?? "")
                    }
                    disabled={readOnly || !!protection}
                    helperText={
                      protection
                        ? "Protected copy comes from the production inputs. Edit it there."
                        : undefined
                    }
                    onChange={(event) =>
                      patchElement(element.id, { text: event.target.value })
                    }
                  />
                )}
                {element.kind === "asset" && (
                  <TextInput
                    label={`Asset reference: ${element.id}`}
                    value={protection?.asset_id ?? element.asset_id ?? ""}
                    disabled={readOnly || !!protection}
                    onChange={(event) =>
                      patchElement(element.id, { asset_id: event.target.value })
                    }
                  />
                )}
                {(element.entity_id ?? protection?.entity_id) && (
                  <Caption>
                    Entity: {element.entity_id ?? protection?.entity_id}
                  </Caption>
                )}
                <TextInput
                  label={`Graphic notes: ${element.id}`}
                  value={element.direction ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchElement(element.id, { direction: event.target.value })
                  }
                />
              </FlexColumn>
            );
          })}
          <FlexRow gap={SPACING.sm} wrap>
            <EditorButton
              disabled={readOnly}
              onClick={() => {
                const ids = new Set(
                  graphics.elements?.map((element) => element.id)
                );
                let suffix = 1;
                while (ids.has(`text-${suffix}`)) { suffix++; }
                onChange({
                  ...draft,
                  graphics: {
                    ...graphics,
                    elements: [
                      ...(graphics.elements ?? []),
                      { id: `text-${suffix}`, kind: "text", text: "Your text" }
                    ]
                  }
                });
              }}
            >
              Add text
            </EditorButton>
            <EditorButton
              disabled={readOnly}
              onClick={() => onChange({ ...draft, graphics: undefined })}
            >
              Remove graphics intent
            </EditorButton>
          </FlexRow>
        </>
      )}
    </FlexColumn>
  );
}
