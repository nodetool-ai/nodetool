/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import isEqual from "lodash/isEqual";
import PropertyLabel from "../../node/PropertyLabel";
import { PropertyProps } from "../../node/PropertyInput";
import { Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FileBrowserDialog from "../../dialogs/FileBrowserDialog";

// Types
export type PathType = "file_path" | "folder_path";

interface PathPreviewProps {
  value?: { path: string };
  onBrowseClick: () => void;
  onClear: () => void;
  ariaLabel: string;
}

interface BasePathPropertyProps extends PropertyProps {
  pathType: PathType;
  dialogTitle: string;
  onlyDirs: boolean;
}

/**
 * Check if native dialog API is available (running in Electron)
 */
const hasNativeDialog = (): boolean => {
  return typeof window !== "undefined" && window.api?.dialog !== undefined;
};

// Styles
const createPathPropertyStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",

    ".path-picker__inputs": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minHeight: "20px",
      flex: 1
    },

    ".path-picker__browse-button": {
      backgroundColor: theme.vars.palette.grey[600],
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "2px",
      color: theme.vars.palette.common.white,
      cursor: "pointer",
      padding: "2px 4px",
      height: "100%",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[500]
      }
    },

    ".path-picker__preview": {
      display: "flex",
      alignItems: "center",
      flex: 1,
      color: theme.vars.palette.grey[400],
      fontSize: theme.vars.fontSizeTinyer,
      marginLeft: ".5em",
      wordBreak: "break-all",
      minHeight: "20px"
    },

    ".path-picker__reset-button": {
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "50%",
      color: theme.vars.palette.grey[400],
      cursor: "pointer",
      padding: "4px 8px",
      minWidth: "20px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      "&:hover": {
        color: "var(--palette-primary-main)"
      }
    }
  });

// Components
const PathPreview = ({
  value,
  onBrowseClick,
  onClear,
  ariaLabel
}: PathPreviewProps) => {
  return (
    <div className="path-picker__inputs">
      <button onClick={onBrowseClick} className="path-picker__browse-button">
        Browse
      </button>
      <div className="path-picker__preview">
        <Typography>{value?.toString()}</Typography>
        {value?.toString() && (
          <button
            onClick={onClear}
            className="path-picker__reset-button"
            aria-label={ariaLabel}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

const BasePathProperty = (props: BasePathPropertyProps) => {
  const theme = useTheme();
  const { onChange: propsOnChange, value, onlyDirs, dialogTitle, pathType, property, propertyIndex } = props;
  const id = `${pathType}-${property.name}-${propertyIndex}`;
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);

  const handleBrowseClick = useCallback(async () => {
    // Use native dialog if available (Electron context)
    // Note: The second check is required for TypeScript type narrowing
    if (hasNativeDialog() && window.api.dialog) {
      try {
        const currentValue = typeof value === "string" ? value : undefined;

        if (onlyDirs) {
          // Folder selection
          const result = await window.api.dialog.openFolder({
            title: dialogTitle,
            defaultPath: currentValue
          });
          if (!result.canceled && result.filePaths.length > 0) {
            propsOnChange(result.filePaths[0]);
          }
        } else {
          // File selection
          const result = await window.api.dialog.openFile({
            title: dialogTitle,
            defaultPath: currentValue
          });
          if (!result.canceled && result.filePaths.length > 0) {
            propsOnChange(result.filePaths[0]);
          }
        }
      } catch (error) {
        // If native dialog fails, fall back to the custom dialog
        console.error("Native dialog failed, falling back to custom dialog:", error);
        setIsFileBrowserOpen(true);
      }
    } else {
      // No native dialog available, use custom FileBrowserDialog
      setIsFileBrowserOpen(true);
    }
  }, [propsOnChange, value, onlyDirs, dialogTitle]);

  const handleClear = useCallback(() => {
    propsOnChange("");
  }, [propsOnChange]);

  const handleConfirm = useCallback(
    (path: string) => {
      propsOnChange(path);
      setIsFileBrowserOpen(false);
    },
    [propsOnChange]
  );

  const handleCancel = useCallback(() => {
    setIsFileBrowserOpen(false);
  }, []);

  return (
    <div css={createPathPropertyStyles(theme)} className="path-picker">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />

      <PathPreview
        value={value}
        onBrowseClick={handleBrowseClick}
        onClear={handleClear}
        ariaLabel={`Clear ${pathType.split("_")[0]} selection`}
      />

      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={dialogTitle}
        initialPath={typeof value === "string" ? value : "~"}
        selectionMode={onlyDirs ? "directory" : "file"}
      />
    </div>
  );
};

export default memo(BasePathProperty, isEqual);
