import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import type {
  ScriptLine,
  ScriptSpeaker
} from "../../../stores/script/ScriptStore";
import { trpc } from "../../../trpc/client";
import ScriptSpeakerAvatar from "../../script/ScriptSpeakerAvatar";
import {
  AudioPlayback,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  Text
} from "../../ui_primitives";
import { EmbedCard } from "./EmbedCard";

const AVATAR_SIZE = 24;

/** The take a line plays: its chosen take, else its newest one. */
export const lineTake = (line: ScriptLine) =>
  line.takes.find((take) => take.id === line.currentTakeId) ??
  line.takes[line.takes.length - 1];

const ScriptLineRow = ({
  line,
  speaker
}: {
  line: ScriptLine;
  speaker: ScriptSpeaker | null;
}) => {
  const take = lineTake(line);
  return (
    <FlexRow component="span" gap={GAP.normal} align="flex-start">
      <ScriptSpeakerAvatar speaker={speaker} size={AVATAR_SIZE} />
      <FlexColumn component="span" gap={GAP.tight} sx={{ flex: 1, minWidth: 0 }}>
        {speaker && (
          <Label size="small" component="span">
            {speaker.name}
          </Label>
        )}
        {line.direction && (
          <Caption size="small" color="muted" component="span">
            {`(${line.direction})`}
          </Caption>
        )}
        <Text size="small" component="span">
          {line.text}
        </Text>
        {take && (
          <AudioPlayback
            locator={`asset://${take.assetId}`}
            label={speaker ? `${speaker.name}: ${line.text}` : line.text}
          />
        )}
      </FlexColumn>
    </FlexRow>
  );
};

/**
 * A voice script: each line with its speaker, direction and voiced take, so
 * the document follows the script as lines are re-voiced.
 */
const ScriptEmbed = ({ scriptId, alt }: { scriptId: string; alt: string }) => {
  const { t } = useTranslation();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { data: script, isLoading } = trpc.scripts.get.useQuery(
    { id: scriptId },
    { staleTime: 30_000, retry: false }
  );

  const open = useCallback(() => {
    if (!script) {
      return;
    }
    openTab({
      type: "script",
      ref: script.id,
      mode: "edit",
      title: script.name,
      projectId: script.projectId
    });
  }, [script, openTab]);

  if (isLoading) {
    return (
      <Caption size="small" color="muted" component="span">
        {alt || t("documentEditor.embed.loadingScript")}
      </Caption>
    );
  }
  if (!script) {
    return (
      <Caption size="small" color="muted" component="span">
        {t("documentEditor.embed.scriptMissing", { name: alt || scriptId })}
      </Caption>
    );
  }
  // SAFETY: the wire document mirrors the script store's draft types.
  const cast = script.document.cast as ScriptSpeaker[];
  const sections = script.document.sections as {
    id: string;
    title?: string;
    lines: ScriptLine[];
  }[];
  const speakerOf = (line: ScriptLine) =>
    cast.find((speaker) => speaker.id === line.speakerId) ?? null;
  const empty = sections.every((section) => section.lines.length === 0);

  return (
    <EmbedCard
      caption={alt || script.name}
      openLabel={t("documentEditor.embed.openScript")}
      onOpen={open}
      testId="document-script-embed"
    >
      {empty ? (
        <Caption size="small" color="muted" component="span">
          {t("documentEditor.embed.scriptEmpty")}
        </Caption>
      ) : (
        <FlexColumn component="span" gap={GAP.normal}>
          {sections.map((section) => (
            <FlexColumn component="span" gap={GAP.normal} key={section.id}>
              {section.title && (
                <Label size="small" component="span" color="muted">
                  {section.title}
                </Label>
              )}
              {section.lines.map((line) => (
                <ScriptLineRow key={line.id} line={line} speaker={speakerOf(line)} />
              ))}
            </FlexColumn>
          ))}
        </FlexColumn>
      )}
    </EmbedCard>
  );
};

export default ScriptEmbed;
