/**
 * Premiere's Paste Attributes dialog (Ctrl+Alt+V): pick which of the copied
 * clip's settings the selected clips take. Groups the copied clip does not
 * carry are offered unticked; groups none of the selected clips can use are
 * left out.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { sourceRate, type TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import {
  attributeGroupApplies,
  PASTE_ATTRIBUTE_GROUPS,
  PASTE_ATTRIBUTE_LABELS,
  type PasteAttributeGroup
} from "../../../stores/timeline/pasteAttributes";
import { runAsOneUndoEntry } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  Caption,
  Checkbox,
  Dialog,
  FlexColumn,
  SPACING
} from "../../ui_primitives";

/** Whether the copied clip has anything for `group` beyond the defaults. */
function sourceCarries(source: TimelineClip, group: PasteAttributeGroup): boolean {
  switch (group) {
    case "motion":
      return (
        source.transform !== undefined ||
        source.crop !== undefined ||
        source.borderRadius !== undefined
      );
    case "opacity":
      return source.opacity !== undefined || source.blendMode !== undefined;
    case "effects":
      return (source.effects?.length ?? 0) > 0;
    case "animations":
      return (source.animations?.length ?? 0) > 0;
    case "speed":
      return sourceRate(source) !== 1;
    case "volume":
      return (source.volumeDb ?? 0) !== 0;
    case "audioEffects":
      return (source.audioEffects?.length ?? 0) > 0;
  }
}

interface PasteAttributesDialogProps {
  clipIds: readonly string[];
  source: TimelineClip;
  onClose: () => void;
}

export const PasteAttributesDialog: React.FC<PasteAttributesDialogProps> =
  memo(({ clipIds, source, onClose }) => {
    const docStore = useTimelineStoreApi();
    const groups = useMemo(() => {
      const targets = docStore
        .getState()
        .clips.filter((c) => clipIds.includes(c.id));
      return PASTE_ATTRIBUTE_GROUPS.filter(
        (g) =>
          attributeGroupApplies(g, source) &&
          targets.some((t) => attributeGroupApplies(g, t))
      );
    }, [docStore, clipIds, source]);
    const [chosen, setChosen] = useState<ReadonlySet<PasteAttributeGroup>>(
      () => new Set(groups.filter((g) => sourceCarries(source, g)))
    );

    const toggle = useCallback((group: PasteAttributeGroup) => {
      setChosen((prev) => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
      });
    }, []);

    const handleConfirm = useCallback(() => {
      runAsOneUndoEntry(docStore, () => {
        docStore
          .getState()
          .pasteClipAttributes(new Set(clipIds), source, chosen);
        if (chosen.has("speed")) {
          const speed = sourceRate(source);
          for (const id of clipIds) {
            const target = docStore.getState().clips.find((c) => c.id === id);
            if (target && attributeGroupApplies("speed", target)) {
              docStore.getState().setClipSpeed(id, speed);
            }
          }
        }
      });
      onClose();
    }, [docStore, clipIds, source, chosen, onClose]);

    return (
      <Dialog
        open
        onClose={onClose}
        title="Paste attributes"
        onConfirm={handleConfirm}
        confirmText="Paste"
        confirmDisabled={chosen.size === 0}
      >
        <FlexColumn gap={SPACING.sm}>
          <Caption color="muted">{`From "${source.name}"`}</Caption>
          {groups.length === 0 ? (
            <Caption>The copied clip has nothing these clips can take.</Caption>
          ) : (
            groups.map((group) => (
              <Checkbox
                key={group}
                size="small"
                checked={chosen.has(group)}
                onChange={() => toggle(group)}
                label={PASTE_ATTRIBUTE_LABELS[group]}
              />
            ))
          )}
        </FlexColumn>
      </Dialog>
    );
  });

PasteAttributesDialog.displayName = "PasteAttributesDialog";
