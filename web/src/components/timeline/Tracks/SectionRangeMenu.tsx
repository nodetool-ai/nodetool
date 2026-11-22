/**
 * Right-click menu of the ruler for the picked range (CE4, D48): Cut, Copy,
 * Paste, Delete, Insert Silence and Duplicate Section across all tracks.
 */

import { useTranslation } from "react-i18next";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";
import {
  copyRange,
  cutRange,
  deleteRange,
  duplicateRange,
  hasSectionClipboard,
  insertSilenceInRange,
  pasteAtPlayhead,
  setLocatorsFromRange,
  splitAtRangeEdges
} from "./sectionRange";

interface SectionRangeMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onError: (message: string) => void;
}

export function SectionRangeMenu({
  position,
  onClose,
  onError
}: SectionRangeMenuProps) {
  const { t } = useTranslation();
  const range = useTimelineUIStore((s) => s.sectionRange);
  const setRange = useTimelineUIStore((s) => s.setSectionRange);
  const run = (task: () => Promise<void>) => () => {
    onClose();
    task().catch((err: unknown) =>
      onError(err instanceof Error ? err.message : "Section edit failed")
    );
  };
  return (
    <ContextMenu open position={position} onClose={onClose}>
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.cut")}
        disabled={!range}
        onClick={run(() => cutRange(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.copy")}
        disabled={!range}
        onClick={run(() => copyRange(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.paste")}
        disabled={!hasSectionClipboard()}
        onClick={run(pasteAtPlayhead)}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.delete")}
        dividerBefore
        color="error"
        disabled={!range}
        onClick={run(() => deleteRange(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.insertSilence")}
        disabled={!range}
        onClick={run(() => insertSilenceInRange(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.duplicate")}
        dividerBefore
        disabled={!range}
        onClick={run(() => duplicateRange(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.splitAtEdges")}
        dividerBefore
        disabled={!range}
        onClick={run(() => splitAtRangeEdges(range!))}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.setLocators")}
        disabled={!range}
        onClick={() => {
          setLocatorsFromRange(range!);
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.rangeMenu.clear")}
        dividerBefore
        disabled={!range}
        onClick={() => {
          setRange(null);
          onClose();
        }}
      />
    </ContextMenu>
  );
}
