import { useMemo, useState } from "react";
import type { AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps as applyGameOps, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient } from "../../../../trpc/client";
import { mergeByUnits } from "../../../../stores/documentMerge";
import { useConflictStore } from "../../../../stores/ConflictStore";
import { diffAnyGameDocuments as diffGameDocuments } from "../../../../stores/game/diffAnyGameDocuments";
import { getGameDraftStore } from "../../../../stores/game/GameDraftStore";
import { acceptServerAnyGameUnit as acceptServerGameUnit, anyGameMergeAdapter as gameMergeAdapter } from "../../../../stores/game/anyMerge";
import { Caption, EditorButton, FlexColumn, FlexRow, SPACING, Text } from "../../../ui_primitives";

interface GameChangesProps {
  gameId: string;
  document: GameDocument;
  onOps: (ops: GameDocumentOp[]) => void;
  onHover: (ids: string[]) => void;
  onFocusMessage: (threadId: string, messageId: string) => void;
}

export default function GameChanges({ gameId, document, onOps, onHover, onFocusMessage }: GameChangesProps) {
  const { data: changes } = trpc.games.draftChanges.useQuery({ id: gameId }, { staleTime: 5_000 });
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => {
    if (!changes) return [];
    const result: { id: string; threadId: string | null; messageId: string | null; summary: string[]; entityIds: string[]; ops: GameDocumentOp[] }[] = [];
    for (const change of [...changes].reverse()) {
      if (change.actor !== "agent") continue;
      const previous = result[result.length - 1];
      if (previous && change.messageId && previous.messageId === change.messageId) {
        previous.summary.push(change.summary);
        previous.entityIds.push(...change.affectedEntityIds);
        previous.ops.push(...change.ops);
      } else {
        result.push({ id: change.id, threadId: change.threadId, messageId: change.messageId, summary: [change.summary],
          entityIds: [...change.affectedEntityIds], ops: [...change.ops] });
      }
    }
    return result.reverse();
  }, [changes]);

  const undo = async (group: typeof groups[number]) => {
    setUndoing(group.id);
    try {
      const before = await trpcClient.games.draftBeforeChange.query({ id: gameId, changeId: group.id });
      const after = applyGameOps(before, group.ops);
      const current = getGameDraftStore(gameId).getState().document ?? document;
      const result = mergeByUnits(after, current, before, gameMergeAdapter(document), { mergeWithoutOps: true });
      onOps(diffGameDocuments(current, result.doc));
      useConflictStore.getState().addConflicts(`game:${gameId}`, result.conflicts, {
        onAccept: (unitId) => {
          const conflict = result.conflicts.find((entry) => entry.unit.id === unitId);
          if (!conflict) return;
          const latest = getGameDraftStore(gameId).getState().document;
          if (!latest) return;
          const accepted = acceptServerGameUnit(latest, before, conflict.unit.kind, unitId);
          onOps(diffGameDocuments(latest, accepted));
        },
        onDiscard: () => undefined
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUndoing(null);
    }
  };

  if (groups.length === 0) return null;
  return <FlexColumn gap={SPACING.xs} sx={{ maxHeight: "25%", overflowY: "auto" }}>
    <Text>Changes</Text>
    {error && <Caption color="error" role="alert">{error}</Caption>}
    {groups.map((group) => <FlexRow key={group.id} gap={SPACING.sm} align="center"
      onMouseEnter={() => onHover([...new Set(group.entityIds)])} onMouseLeave={() => onHover([])}>
      <Caption>{group.summary.join("; ")}</Caption>
      {group.threadId && group.messageId && <EditorButton onClick={() => {
        if (group.threadId && group.messageId) onFocusMessage(group.threadId, group.messageId);
      }}>View in chat</EditorButton>}
      <EditorButton disabled={undoing !== null} onClick={() => void undo(group)}>Undo</EditorButton>
    </FlexRow>)}
  </FlexColumn>;
}
