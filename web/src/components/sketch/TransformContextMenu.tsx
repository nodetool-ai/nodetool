import React, { memo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import Rotate90DegreesCwIcon from "@mui/icons-material/Rotate90DegreesCw";
import FlipIcon from "@mui/icons-material/Flip";
import {
  ContextMenu,
  Divider,
  ListSubheader,
  MenuItemPrimitive
} from "../ui_primitives";

interface TransformContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
  onTransformReset?: () => void;
  onRotate90CW?: () => void;
  onRotate90CCW?: () => void;
  onRotate180?: () => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
}

const TransformContextMenu: React.FC<TransformContextMenuProps> = ({
  open,
  position,
  onClose,
  onTransformCommit,
  onTransformCancel,
  onTransformReset,
  onRotate90CW,
  onRotate90CCW,
  onRotate180,
  onFlipHorizontal,
  onFlipVertical
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    // Not on the dispatcher: capture phase + stopPropagation is load-bearing —
    // this menu must swallow Escape before the editor beneath it (which still
    // listens in capture phase) sees it.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  return (
    <ContextMenu
      open={open}
      onClose={onClose}
      position={position}
      transitionDuration={{ enter: 60, exit: 40 }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left"
      }}
      disableRestoreFocus
      minWidth={200}
      paperSx={{ maxWidth: 280 }}
      slotProps={{
        paper: {
          className: "sketch-transform-context-menu"
        }
      }}
    >
      <ListSubheader>{t("i18n-next13.sketch.transform.freeTransform")}</ListSubheader>

      <MenuItemPrimitive
        label={t("i18n-next13.sketch.actions.commit")}
        icon={<CheckIcon />}
        shortcut="Enter"
        onClick={() => {
          onTransformCommit?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next13.sketch.actions.cancel")}
        icon={<CloseIcon />}
        shortcut="Esc"
        onClick={() => {
          onTransformCancel?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next13.sketch.actions.reset")}
        icon={<RestartAltIcon />}
        onClick={() => {
          onTransformReset?.();
          onClose();
        }}
      />

      <Divider />

      <MenuItemPrimitive
        label={t("i18n-next13.sketch.transform.rotate180")}
        icon={<Rotate90DegreesCwIcon />}
        onClick={() => {
          onRotate180?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next13.sketch.transform.rotate90CW")}
        icon={<RotateRightIcon />}
        onClick={() => {
          onRotate90CW?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next13.sketch.transform.rotate90CCW")}
        icon={<RotateLeftIcon />}
        onClick={() => {
          onRotate90CCW?.();
          onClose();
        }}
      />

      <Divider />

      <MenuItemPrimitive
        label={t("i18n-next13.sketch.transform.flipHorizontal")}
        icon={<FlipIcon />}
        onClick={() => {
          onFlipHorizontal?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label={t("i18n-next13.sketch.transform.flipVertical")}
        icon={<FlipIcon sx={{ transform: "rotate(90deg)" }} />}
        onClick={() => {
          onFlipVertical?.();
          onClose();
        }}
      />
    </ContextMenu>
  );
};

export default memo(TransformContextMenu);
