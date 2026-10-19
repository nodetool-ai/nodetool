import React from "react";
import { useTranslation } from "react-i18next";
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
  TextArea,
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
  const { t } = useTranslation();
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
    if (readOnly || !graphics) {
      return;
    }
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
      <Label>{t("screens4_17.storyboard.shotGraphicsEditor.title")}</Label>
      {!graphics ? (
        <EditorButton
          disabled={readOnly}
          onClick={() =>
            onChange({ ...draft, graphics: { mode: "overlay", elements: [] } })
          }
        >
          {t("screens4_17.storyboard.shotGraphicsEditor.addIntent")}
        </EditorButton>
      ) : (
        <>
          <SelectField
            label={t(
              "screens4_17.storyboard.shotGraphicsEditor.compositionMode"
            )}
            value={graphics.mode ?? "overlay"}
            disabled={readOnly}
            options={[
              {
                value: "none",
                label: t("screens4_17.storyboard.shotGraphicsEditor.modes.none")
              },
              {
                value: "overlay",
                label: t(
                  "screens4_17.storyboard.shotGraphicsEditor.modes.overlay"
                )
              },
              {
                value: "graphics_first",
                label: t(
                  "screens4_17.storyboard.shotGraphicsEditor.modes.graphicsFirst"
                )
              },
              {
                value: "hybrid",
                label: t(
                  "screens4_17.storyboard.shotGraphicsEditor.modes.hybrid"
                )
              }
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
          <TextArea
            label={t("screens4_17.storyboard.shotGraphicsEditor.direction")}
            value={graphics.direction ?? ""}
            disabled={readOnly}
            onChange={(value) =>
              onChange({
                ...draft,
                graphics: { ...graphics, direction: value }
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
                    label={t(
                      "screens4_17.storyboard.shotGraphicsEditor.exactText",
                      {
                        id: element.id
                      }
                    )}
                    value={
                      protection?.kind === "exact_text"
                        ? (protection.value ?? "")
                        : (element.text ?? "")
                    }
                    disabled={readOnly || !!protection}
                    helperText={
                      protection
                        ? t(
                            "screens4_17.storyboard.shotGraphicsEditor.protectedCopy"
                          )
                        : undefined
                    }
                    onChange={(event) =>
                      patchElement(element.id, { text: event.target.value })
                    }
                  />
                )}
                {element.kind === "asset" && (
                  <TextInput
                    label={t(
                      "screens4_17.storyboard.shotGraphicsEditor.assetReference",
                      {
                        id: element.id
                      }
                    )}
                    value={protection?.asset_id ?? element.asset_id ?? ""}
                    disabled={readOnly || !!protection}
                    onChange={(event) =>
                      patchElement(element.id, { asset_id: event.target.value })
                    }
                  />
                )}
                {(element.entity_id ?? protection?.entity_id) && (
                  <Caption>
                    {t("screens4_17.storyboard.shotGraphicsEditor.entity", {
                      id: element.entity_id ?? protection?.entity_id
                    })}
                  </Caption>
                )}
                <TextInput
                  label={t(
                    "screens4_17.storyboard.shotGraphicsEditor.graphicNotes",
                    {
                      id: element.id
                    }
                  )}
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
                while (ids.has(`text-${suffix}`)) {
                  suffix++;
                }
                onChange({
                  ...draft,
                  graphics: {
                    ...graphics,
                    elements: [
                      ...(graphics.elements ?? []),
                      {
                        id: `text-${suffix}`,
                        kind: "text",
                        text: t(
                          "screens4_17.storyboard.shotGraphicsEditor.defaultText"
                        )
                      }
                    ]
                  }
                });
              }}
            >
              {t("screens4_17.storyboard.shotGraphicsEditor.addText")}
            </EditorButton>
            <EditorButton
              disabled={readOnly}
              onClick={() => onChange({ ...draft, graphics: undefined })}
            >
              {t("screens4_17.storyboard.shotGraphicsEditor.removeIntent")}
            </EditorButton>
          </FlexRow>
        </>
      )}
    </FlexColumn>
  );
}
