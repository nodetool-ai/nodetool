/** @jsxImportSource @emotion/react */
/**
 * Scene list for a bound storyboard: reorder or remove shots and write the
 * document back through the resource envelope.
 *
 * Every write carries the `revision` this widget read. When the server rejects
 * it — someone else, or an agent, wrote first — the edit is dropped, the
 * document is refetched, and the user is told their view was behind. Retrying
 * blindly would clobber the write that won.
 *
 * The document lives in TanStack Query, not the app store: the store holds the
 * `ResourceRef` and the selection, never entity data.
 */
import React, { useCallback, useMemo, useState } from "react";

import {
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { trpc } from "../../../trpc/client";
import { isConcurrencyConflict } from "../../../hooks/useApplications";
import { useBoundResource } from "./useBoundResource";
import { isString } from "../../../utils/typePredicates";

export interface StoryboardSceneListProps {
  /** Puck injects the placed widget's id. */
  id?: string;
  /** Id of the `ResourceBinding` in the app document. */
  resourceBindingId?: string;
  label?: string;
  /** Hide the per-row remove button. */
  allowRemove?: boolean;
  disabled?: boolean;
}

type ShotRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ShotRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The shots array of a storyboard document, or null when the shape is foreign. */
const readShots = (document: unknown): ShotRecord[] | null => {
  if (!isRecord(document)) return null;
  const { shots } = document;
  if (!Array.isArray(shots)) return null;
  return shots.filter(isRecord);
};

const sceneLabel = (shot: ShotRecord, index: number): string => {
  for (const key of ["slug", "action", "name"]) {
    const value = shot[key];
    if (isString(value) && value.trim().length > 0) return value;
  }
  return `Scene ${index + 1}`;
};

/** Shots carry their position; renumber after every reorder or removal. */
const renumber = (shots: ShotRecord[]): ShotRecord[] =>
  shots.map((shot, index) => ({ ...shot, index }));

const swap = (shots: ShotRecord[], a: number, b: number): ShotRecord[] => {
  const next = [...shots];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

export const StoryboardSceneListWidget: React.FC<StoryboardSceneListProps> = ({
  resourceBindingId,
  label,
  allowRemove = true,
  disabled
}) => {
  const { binding, designMode, selected } = useBoundResource(
    resourceBindingId,
    true
  );
  const utils = trpc.useUtils();
  const [staleView, setStaleView] = useState(false);

  const targetId = selected?.id ?? "";
  // Keyed without the revision so a successful write does not orphan the cache
  // entry it just refreshed.
  const readInput = useMemo(
    () => ({ ref: { kind: "storyboard" as const, id: targetId } }),
    [targetId]
  );

  const { data: detail, isLoading } = trpc.resources.read.useQuery(readInput, {
    enabled: Boolean(targetId) && !designMode && binding?.kind === "storyboard"
  });

  const update = trpc.resources.update.useMutation({
    onSuccess: (updated) => {
      setStaleView(false);
      utils.resources.read.setData(readInput, updated);
    },
    onError: (error) => {
      if (!isConcurrencyConflict(error)) return;
      // Someone wrote first. Drop this edit and pull the document that won.
      setStaleView(true);
      void utils.resources.read.invalidate(readInput);
    }
  });

  const shots = useMemo(() => readShots(detail?.document), [detail?.document]);

  const writeShots = useCallback(
    (next: ShotRecord[]) => {
      if (!detail || !isRecord(detail.document)) return;
      update.mutate({
        ref: {
          kind: "storyboard",
          id: readInput.ref.id,
          revision: detail.ref.revision
        },
        document: { ...detail.document, shots: renumber(next) }
      });
    },
    [detail, readInput, update]
  );

  if (!binding) {
    return (
      <Caption color="secondary">
        {designMode
          ? "Pick a resource binding for this scene list."
          : "This scene list is not bound to a resource."}
      </Caption>
    );
  }

  const title = label || binding.name;

  if (binding.kind !== "storyboard") {
    return (
      <Caption color="secondary">
        Scene lists need a storyboard binding; “{binding.name}” is a{" "}
        {binding.kind}.
      </Caption>
    );
  }

  if (designMode) {
    return (
      <FlexColumn gap={SPACING.xs} fullWidth>
        <Label>{title}</Label>
        <Caption color="secondary">
          Scenes appear when the app runs against a storyboard.
        </Caption>
      </FlexColumn>
    );
  }

  const busy = Boolean(disabled) || update.isPending;
  const writeError =
    update.error && !isConcurrencyConflict(update.error)
      ? update.error.message
      : null;

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      <Label>{title}</Label>

      {staleView ? (
        <AlertBanner severity="warning" compact>
          This storyboard changed since you opened it. Your edit was not applied
          — the scenes below have been reloaded.
        </AlertBanner>
      ) : null}
      {writeError ? (
        <AlertBanner severity="error" compact>
          {writeError}
        </AlertBanner>
      ) : null}

      {!targetId ? (
        <Caption color="secondary">Select a storyboard to edit its scenes.</Caption>
      ) : shots === null ? (
        <Caption color="secondary">
          {isLoading ? "Loading…" : "This resource has no scenes."}
        </Caption>
      ) : shots.length === 0 ? (
        <Caption color="secondary">This storyboard has no scenes yet.</Caption>
      ) : (
        <Box
          component="ul"
          aria-label={title}
          aria-busy={update.isPending || undefined}
          sx={{ listStyle: "none", m: 0, p: 0, width: "100%" }}
        >
          {shots.map((shot, index) => {
            const name = sceneLabel(shot, index);
            return (
              <Box
                component="li"
                key={isString(shot.id) ? shot.id : index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACING.sm,
                  p: SPACING.sm,
                  borderRadius: BORDER_RADIUS.md,
                  border: "1px solid",
                  borderColor: "divider",
                  mb: SPACING.xs
                }}
              >
                <Text size="normal" sx={{ flex: 1, minWidth: 0 }}>
                  {name}
                </Text>
                <FlexRow gap={SPACING.xs}>
                  <EditorButton
                    aria-label={`Move ${name} up`}
                    disabled={busy || index === 0}
                    onClick={() => writeShots(swap(shots, index, index - 1))}
                  >
                    Up
                  </EditorButton>
                  <EditorButton
                    aria-label={`Move ${name} down`}
                    disabled={busy || index === shots.length - 1}
                    onClick={() => writeShots(swap(shots, index, index + 1))}
                  >
                    Down
                  </EditorButton>
                  {allowRemove ? (
                    <EditorButton
                      aria-label={`Remove ${name}`}
                      color="warning"
                      disabled={busy}
                      onClick={() =>
                        writeShots(shots.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </EditorButton>
                  ) : null}
                </FlexRow>
              </Box>
            );
          })}
        </Box>
      )}
    </FlexColumn>
  );
};

export default StoryboardSceneListWidget;
