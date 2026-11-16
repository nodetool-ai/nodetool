/**
 * The panel beside the text: the board's acts, scenes and shots as the text
 * reads them right now, and the lines that need attention. Both jump to their
 * line in the text.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { StoryboardMarkdownResult } from "@nodetool-ai/protocol";

import { Caption, FlexColumn, ScrollArea, Text, TreeRow, EYEBROW, SPACING } from "../../ui_primitives";

interface StoryboardTextOutlineProps {
  result: StoryboardMarkdownResult | null;
  /** The line that holds the caret, to mark where the director is. */
  caretLine: number | null;
  onJump: (line: number) => void;
}

interface OutlineEntry {
  line: number;
  depth: number;
  kind: "act" | "scene" | "shot";
  label: string;
  number?: number;
}

/** Acts, scenes and shots in text order, nested by what holds them. */
export function outlineEntries(result: StoryboardMarkdownResult): OutlineEntry[] {
  const doc = result.document;
  const shots = new Map(doc.shots.map((shot) => [shot.id, shot]));
  const scenes = new Map((doc.screenplay?.scenes ?? []).map((scene) => [scene.id, scene]));
  const acts = new Map((doc.screenplay?.acts ?? []).map((act) => [act.id, act]));
  const entries: OutlineEntry[] = [];
  let inAct = false;
  let inScene = false;
  for (const info of result.lines) {
    const id = info.group?.split(":")[1] ?? "";
    if (info.role === "act") {
      inAct = true;
      inScene = false;
      entries.push({ line: info.line, depth: 0, kind: "act", label: acts.get(id)?.title ?? "" });
    } else if (info.role === "scene") {
      inScene = true;
      entries.push({ line: info.line, depth: inAct ? 1 : 0, kind: "scene", label: scenes.get(id)?.slugline ?? "" });
    } else if (info.role === "shot" && info.shotId) {
      entries.push({
        line: info.line,
        depth: (inAct ? 1 : 0) + (inScene ? 1 : 0),
        kind: "shot",
        label: shots.get(info.shotId)?.slug ?? "",
        number: info.shotNumber
      });
    }
  }
  return entries;
}

const StoryboardTextOutline: React.FC<StoryboardTextOutlineProps> = ({ result, caretLine, onJump }) => {
  const { t } = useTranslation();
  const entries = useMemo(() => (result ? outlineEntries(result) : []), [result]);
  const current = useMemo(() => {
    if (caretLine === null) {
      return -1;
    }
    let found = -1;
    entries.forEach((entry, i) => {
      if (entry.line <= caretLine) {
        found = i;
      }
    });
    return found;
  }, [entries, caretLine]);
  const warnings = result?.warnings ?? [];

  return (
    <ScrollArea thin sx={{ minHeight: 0, flex: 1 }}>
      <FlexColumn gap={SPACING.xs} sx={{ paddingBlock: SPACING.sm }}>
        <Caption sx={EYEBROW}>{t("storyboardText.outline")}</Caption>
        {entries.length === 0 && <Caption color="secondary">{t("storyboardText.outlineEmpty")}</Caption>}
        {entries.map((entry, i) => (
          <TreeRow
            key={`${entry.kind}:${entry.line}`}
            component="button"
            type="button"
            interactive
            depth={entry.depth}
            selected={i === current}
            onClick={() => onJump(entry.line)}
          >
            <Text
              size={entry.kind === "shot" ? "small" : "smaller"}
              weight={entry.kind === "shot" ? 400 : 600}
              color={entry.kind === "shot" ? undefined : "secondary"}
              truncate
            >
              {entry.kind === "shot"
                ? `${entry.number}  ${entry.label || t("storyboardText.untitledShot")}`
                : entry.label || (entry.kind === "act" ? t("storyboardText.untitledAct") : t("storyboardText.untitledScene"))}
            </Text>
          </TreeRow>
        ))}
        {warnings.length > 0 && (
          <>
            <Caption sx={{ ...EYEBROW, marginTop: SPACING.md }} color="error">
              {t("storyboardText.issuesTitle")}
            </Caption>
            {warnings.map((warning) => (
              <TreeRow key={`${warning.line}:${warning.code}`} component="button" type="button" interactive onClick={() => onJump(warning.line)}>
                <Text size="smaller" color="secondary">
                  {t(`storyboardText.warnings.${warning.code}`, { ...warning.params, defaultValue: warning.message })}
                </Text>
              </TreeRow>
            ))}
          </>
        )}
      </FlexColumn>
    </ScrollArea>
  );
};

export default StoryboardTextOutline;
