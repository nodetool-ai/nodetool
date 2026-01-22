/** @jsxImportSource @emotion/react */

import ReactDOM from "react-dom";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { css } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import TableRowsIcon from "@mui/icons-material/TableRows";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { Button, ButtonGroup, Tooltip, TextField, InputAdornment, IconButton } from "@mui/material";
import isEqual from "lodash/isEqual";
import Markdown from "react-markdown";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useCombo } from "../../stores/KeyPressedStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useFullscreenMode } from "../../hooks/editor/useFullscreenMode";
import { useModalResize } from "../../hooks/editor/useModalResize";
import { ColumnDef, DataframeRef } from "../../stores/ApiTypes";
import DataTable from "../node/DataTable/DataTable";
import ColumnsManager from "../node/ColumnsManager";

interface DataframeEditorModalProps {
  value: DataframeRef;
  onChange: (df: DataframeRef) => void;
  onClose: () => void;
  propertyName: string;
  propertyDescription?: string;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    ".modal-overlay": {
      position: "fixed",
      top: "72px",
      left: "51px",
      width: "calc(100vw - 51px)",
      height: "fit-content",
      padding: ".5em .5em 0 .5em",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
      backdropFilter: "blur(8px)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    ".modal-overlay.fullscreen": {
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      padding: 0,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.8)`
    },
    ".modal-content": {
      background: `linear-gradient(135deg, 
        rgba(${theme.vars.palette.background.paperChannel} / 0.95), 
        rgba(${theme.vars.palette.background.defaultChannel} / 0.98))`,
      backdropFilter: "blur(24px) saturate(180%)",
      WebkitBackdropFilter: "blur(24px) saturate(180%)",
      color: theme.vars.palette.text.primary,
      fontSize: "var(--fontSizeBigger)",
      width: "92%",
      maxWidth: "2400px",
      height: "100%",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.08)`,
      borderRadius: theme.vars.rounded.dialog,
      boxShadow:
        "0 40px 80px -20px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05) inset",
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    ".modal-content.fullscreen": {
      width: "100%",
      maxWidth: "100%",
      height: "100%",
      borderRadius: 0,
      border: "none",
      background: theme.vars.palette.background.default
    },
    ".modal-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "1em 1.5em",
      minHeight: "4em",
      background: `linear-gradient(90deg, 
        rgba(${theme.vars.palette.background.defaultChannel} / 0.4) 0%, 
        transparent 100%)`,
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.05)`,
      zIndex: 5,
      h4: {
        cursor: "default",
        fontWeight: "700",
        margin: "0",
        fontSize: "1.1rem",
        letterSpacing: "-0.01em",
        color: theme.vars.palette.text.primary,
        background: `linear-gradient(to right, ${theme.vars.palette.text.primary}, ${theme.vars.palette.grey[400]})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
      }
    },
    ".title-and-description": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "0.25em",
      overflow: "hidden"
    },
    ".description": {
      fontSize: "0.85rem",
      color: theme.vars.palette.grey[400],
      lineHeight: 1.4,
      maxWidth: "600px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      backgroundColor: `rgba(${theme.vars.palette.background.paperChannel} / 0.4)`,
      padding: "4px 8px",
      borderRadius: "10px",
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.04)`,
      "& + .toolbar-group": {
        marginLeft: "0.5em"
      }
    },
    ".actions": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "32px",
      height: "32px",
      minWidth: "32px",
      padding: 0,
      border: "none",
      borderRadius: "8px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[300],
      cursor: "pointer",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.1)`,
        color: theme.vars.palette.common.white,
        transform: "scale(1.05)"
      },
      "&:active": {
        transform: "scale(0.95)"
      },
      "& svg": {
        width: "18px",
        height: "18px"
      }
    },
    ".button-close": {
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.error.mainChannel} / 0.2)`,
        color: theme.vars.palette.error.light
      }
    },
    ".modal-body": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      overflow: "hidden",
      padding: "1em 1.5em"
    },
    ".editor-content": {
      display: "flex",
      flexDirection: "row",
      flex: 1,
      overflow: "hidden",
      gap: "1.5em"
    },
    ".columns-section": {
      flexShrink: 0,
      width: "320px",
      minWidth: "280px",
      maxWidth: "400px",
      overflow: "auto",
      paddingRight: "1em",
      borderRight: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      // Override ColumnsManager styles for modal context
      "& .MuiGrid-root": {
        display: "flex",
        flexDirection: "column",
        gap: "0.25em"
      },
      "& .labels": {
        display: "flex",
        flexDirection: "row",
        gap: "0.5em",
        marginBottom: "0.25em",
        paddingLeft: "0.25em"
      },
      "& .label-name": {
        width: "auto",
        minWidth: "120px",
        flexGrow: 1,
        fontSize: "0.8rem",
        color: theme.vars.palette.grey[400]
      },
      "& .label-datatype": {
        width: "auto",
        minWidth: "80px",
        flexGrow: 0,
        fontSize: "0.8rem",
        color: theme.vars.palette.grey[400]
      },
      "& .column": {
        gap: "0.5em",
        marginBottom: "0.15em"
      },
      "& .item-name": {
        width: "auto",
        minWidth: "120px",
        flexGrow: 1
      },
      "& .item-name .textfield": {
        height: "2.25em"
      },
      "& .item-name .textfield input": {
        fontSize: "0.85rem",
        padding: "0.35em 0.5em"
      },
      "& .item-datatype": {
        width: "auto",
        minWidth: "80px",
        flexGrow: 0
      },
      "& .item-datatype .select": {
        minWidth: "75px"
      },
      "& .item-datatype .select .MuiSelect-select": {
        fontSize: "0.85rem",
        padding: "0.35em 0.5em",
        height: "auto",
        minHeight: "1.5em"
      },
      "& .delete-button": {
        padding: "0.25em",
        "& svg": {
          fontSize: "1rem"
        }
      }
    },
    ".table-section": {
      flex: 1,
      overflow: "hidden",
      minHeight: "200px",
      display: "flex",
      flexDirection: "column",
      "& .datatable": {
        flex: 1,
        height: "100%"
      },
      "& .tabulator": {
        height: "100% !important"
      },
      // Bigger action buttons in modal
      "& .table-actions": {
        gap: "0.25em",
        height: "2.5em",
        marginBottom: "0.5em"
      },
      "& .table-actions button": {
        padding: "0.35em",
        width: "1.5em",
        height: "1.5em"
      },
      "& .table-actions button svg": {
        fontSize: "1rem"
      },
      // Softer row contrast - less difference between odd/even
      "& .tabulator-row": {
        backgroundColor: "#2a2a2a"
      },
      "& .tabulator-row-even": {
        backgroundColor: "#303030"
      },
      "& .tabulator-row:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      }
    },
    ".search-bar": {
      display: "flex",
      alignItems: "center",
      marginBottom: "0.75em",
      "& .MuiTextField-root": {
        maxWidth: "300px"
      },
      "& .MuiInputBase-root": {
        height: "2.25em",
        fontSize: "0.85rem",
        backgroundColor: `rgba(${theme.vars.palette.background.paperChannel} / 0.5)`,
        borderRadius: "6px"
      },
      "& .MuiInputBase-input": {
        padding: "0.35em 0.5em"
      },
      "& .MuiInputAdornment-root": {
        marginRight: "0.25em"
      },
      "& svg": {
        fontSize: "1rem",
        color: theme.vars.palette.grey[500]
      }
    },
    ".add-column-group": {
      display: "flex",
      marginBottom: "0.75em"
    },
    ".add-column-group button": {
      fontSize: "0.9rem",
      fontFamily: theme.fontFamily2,
      fontWeight: 500,
      wordSpacing: "-0.1em",
      backgroundColor: theme.vars.palette.grey[700],
      border: 0,
      color: theme.vars.palette.grey[100] + " !important",
      display: "flex",
      alignItems: "center",
      margin: 0,
      gap: "0.35em",
      padding: "0.5em 1.25em 0.5em 0.75em",
      borderRadius: "6px",
      transition: "all 0.2s",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[0] + " !important"
      }
    },
    ".add-column-group button svg": {
      fontSize: "1rem",
      marginRight: "0.35em"
    },
    ".resize-handle": {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "12px",
      cursor: "ns-resize",
      backgroundColor: "transparent",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.05)`
      },
      "&:hover .resize-handle-thumb": {
        opacity: 1,
        width: "60px"
      }
    },
    ".resize-handle-thumb": {
      width: "40px",
      height: "4px",
      opacity: 0.5,
      backgroundColor: theme.vars.palette.grey[600],
      borderRadius: "100px",
      transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
    },
    "@media (max-width: 1200px)": {
      ".modal-content": {
        width: "96%"
      }
    },
    "@media (max-width: 900px)": {
      ".title-and-description": {
        gap: "0.25em"
      },
      ".description": {
        display: "block",
        fontSize: "0.75rem"
      },
      ".button": {
        minWidth: "36px",
        minHeight: "36px"
      },
      ".editor-content": {
        flexDirection: "column",
        gap: "1em"
      },
      ".columns-section": {
        width: "100%",
        maxWidth: "none",
        borderRight: "none",
        borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
        paddingRight: 0,
        paddingBottom: "1em",
        overflow: "visible"
      }
    }
  });

const DataframeEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  readOnly = false
}: DataframeEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle
  const { isFullscreen, toggleFullscreen } = useFullscreenMode({
    storageKey: "dataframeEditorModal_fullscreen"
  });

  // Resizable modal height
  const { modalHeight, handleResizeMouseDown } = useModalResize({
    storageKey: "dataframeEditorModal_height",
    defaultHeight: Math.min(500, window.innerHeight - 200)
  });

  // Local state for the dataframe
  const [localValue, setLocalValue] = useState<DataframeRef>(value);
  
  // Search filter state
  const [searchFilter, setSearchFilter] = useState("");

  const handleClearSearch = useCallback(() => {
    setSearchFilter("");
  }, []);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleDataframeChange = useCallback(
    (df: DataframeRef) => {
      setLocalValue(df);
      onChange(df);
    },
    [onChange]
  );

  const onCellChange = useCallback(
    (df: DataframeRef) => {
      handleDataframeChange(df);
    },
    [handleDataframeChange]
  );

  const onChangeColumns = useCallback(
    (columns: ColumnDef[]) => {
      handleDataframeChange({
        ...localValue,
        columns
      });
    },
    [localValue, handleDataframeChange]
  );

  const addColumn = useCallback(() => {
    const columns = localValue.columns || [];
    let newColumnName = "Column 1";
    let counter = 1;
    while (columns.find((col: ColumnDef) => col.name === newColumnName)) {
      newColumnName = `Column ${counter}`;
      counter++;
    }
    const newColumn: ColumnDef = {
      name: newColumnName,
      data_type: "string",
      description: ""
    };
    handleDataframeChange({
      ...localValue,
      columns: [...columns, newColumn]
    });
  }, [handleDataframeChange, localValue]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  // Escape key closes modal
  useCombo(["escape"], onClose);

  // Close signal from other modals so only one modal is active
  useEffect(() => {
    const handler = () => {
      onClose();
    };
    window.addEventListener("close-dataframe-editor-modal", handler);
    return () =>
      window.removeEventListener("close-dataframe-editor-modal", handler);
  }, [onClose]);

  const content = (
    <div className="dataframe-editor-modal" css={styles(theme)}>
      <div
        className={`modal-overlay ${isFullscreen ? "fullscreen" : ""}`}
        role="presentation"
        onClick={handleOverlayClick}
        ref={modalOverlayRef}
      >
        <div
          className={`modal-content ${isFullscreen ? "fullscreen" : ""}`}
          role="dialog"
          aria-modal="true"
          style={{ height: isFullscreen ? "100vh" : modalHeight }}
        >
          <div className="modal-header">
            <div className="title-and-description">
              <h4 className="title">{propertyName}</h4>
              {propertyDescription && (
                <div className="description">
                  <Markdown>{propertyDescription}</Markdown>
                </div>
              )}
            </div>
            <div className="actions">
              <div className="toolbar-group">
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  <button className="button" onClick={toggleFullscreen}>
                    {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                  </button>
                </Tooltip>
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title="Close Editor | Esc"
                >
                  <button className="button button-close" onClick={onClose}>
                    <CloseIcon />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="modal-body">
            <div className="editor-content">
              {!readOnly && (
                <div className="columns-section">
                  <ButtonGroup className="add-column-group">
                    <Button className="add-column" onClick={addColumn}>
                      <TableRowsIcon style={{ rotate: "90deg" }} /> Add Column
                    </Button>
                  </ButtonGroup>
                  <ColumnsManager
                    columns={localValue.columns || []}
                    onChange={onChangeColumns}
                    allData={localValue.data || []}
                  />
                </div>
              )}
              <div className="table-section">
                <div className="search-bar">
                  <TextField
                    placeholder="Search in table..."
                    size="small"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      ),
                      endAdornment: searchFilter && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={handleClearSearch}
                            edge="end"
                          >
                            <ClearIcon />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                </div>
                <DataTable
                  dataframe={localValue}
                  onChange={readOnly ? undefined : onCellChange}
                  editable={!readOnly}
                  isModalMode={true}
                  searchFilter={searchFilter}
                />
              </div>
            </div>
          </div>

          <div className="resize-handle" onMouseDown={handleResizeMouseDown}>
            <span className="resize-handle-thumb"></span>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default memo(DataframeEditorModal, isEqual);
