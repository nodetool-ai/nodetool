/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import isEqual from "../../../utils/isEqual";
import PropertyLabel from "../../node/PropertyLabel";
import { PropertyProps } from "../../node/PropertyInput";
import { useTheme } from "@mui/material/styles";
import { Text, SPACING, getSpacingPx, EditorButton, CloseButton } from "../../ui_primitives";
import type { Theme } from "@mui/material/styles";
import FileBrowserDialog from "../../dialogs/FileBrowserDialog";
import { isString } from "../../../utils/typePredicates";

export type PathType = "file_path" | "folder_path";

interface PathPreviewProps {
  value?: { path: string };
  onBrowseClick: () => void;
  onClear: () => void;
  ariaLabel: string;
  browseLabel: string;
}

interface BasePathPropertyProps extends PropertyProps {
  pathType: PathType;
  dialogTitle: string;
  onlyDirs: boolean;
}

const hasNativeDialog = (): boolean => {
  return typeof window !== "undefined" && window.api?.dialog !== undefined;
};

const createPathPropertyStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.md),

    ".path-picker__inputs": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      minHeight: "20px",
      flex: 1
    },


    ".path-picker__preview": {
      display: "flex",
      alignItems: "center",
      flex: 1,
      color: theme.vars.palette.grey[400],
      fontSize: theme.vars.fontSizeSmaller,
      marginLeft: getSpacingPx(SPACING.md),
      wordBreak: "break-all",
      minHeight: "20px"
    },

  });

const PathPreview = ({
  value,
  onBrowseClick,
  onClear,
  ariaLabel,
  browseLabel
}: PathPreviewProps) => {
  return (
    <div className="path-picker__inputs">
      <EditorButton variant="outlined" onClick={onBrowseClick}>
        {browseLabel}
      </EditorButton>
      <div className="path-picker__preview">
        <Text>{value?.toString()}</Text>
        {value?.toString() && (
          <CloseButton onClick={onClear} tooltip={ariaLabel} />
        )}
      </div>
    </div>
  );
};

const BasePathProperty = (props: BasePathPropertyProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const id = `${props.pathType}-${props.property.name}-${props.propertyIndex}`;
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);

  const handleBrowseClick = useCallback(async () => {
    // The second check is required for TypeScript type narrowing.
    if (hasNativeDialog() && window.api.dialog) {
      try {
        const currentValue = isString(props.value) ? props.value : undefined;

        if (props.onlyDirs) {
          const result = await window.api.dialog.openFolder({
            title: props.dialogTitle,
            defaultPath: currentValue
          });
          if (!result.canceled && result.filePaths.length > 0) {
            props.onChange(result.filePaths[0]);
          }
        } else {
          const result = await window.api.dialog.openFile({
            title: props.dialogTitle,
            defaultPath: currentValue
          });
          if (!result.canceled && result.filePaths.length > 0) {
            props.onChange(result.filePaths[0]);
          }
        }
      } catch (error) {
        // Fall back to the custom dialog when the native dialog fails.
        console.error("Native dialog failed, falling back to custom dialog:", error);
        setIsFileBrowserOpen(true);
      }
    } else {
      setIsFileBrowserOpen(true);
    }
  }, [props]);

  const handleClear = useCallback(() => {
    props.onChange("");
  }, [props]);

  const handleConfirm = useCallback(
    (path: string) => {
      props.onChange(path);
      setIsFileBrowserOpen(false);
    },
    [props]
  );

  const handleCancel = useCallback(() => {
    setIsFileBrowserOpen(false);
  }, []);

  return (
    <div css={createPathPropertyStyles(theme)} className="path-picker">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      <PathPreview
        value={props.value}
        onBrowseClick={handleBrowseClick}
        onClear={handleClear}
        ariaLabel={t("i18n-next63.properties.path.clearSelection", {
          kind: props.pathType.split("_")[0]
        })}
        browseLabel={t("i18n-next63.properties.path.browse")}
      />

      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={props.dialogTitle}
        initialPath={isString(props.value) ? props.value : "~"}
        selectionMode={props.onlyDirs ? "directory" : "file"}
      />
    </div>
  );
};

export default memo(BasePathProperty, isEqual);
