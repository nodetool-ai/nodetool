import React, { useCallback, useEffect, useState, memo } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import RefreshIcon from "@mui/icons-material/Refresh";

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

interface FileTreeItemProps {
  entry: FileEntry;
  workspacePath: string;
  depth: number;
  onFileOpen?: (filePath: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}K`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

const ROW_HEIGHT = 32;
const EXPLORER_FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const FileTreeItem: React.FC<FileTreeItemProps> = memo(
  ({ entry, workspacePath, depth, onFileOpen }) => {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<FileEntry[] | null>(null);
    const [loading, setLoading] = useState(false);

    const toggle = useCallback(async () => {
      if (!entry.isDir) {
        onFileOpen?.(entry.path);
        return;
      }
      if (expanded) {
        setExpanded(false);
        return;
      }
      if (children === null) {
        setLoading(true);
        try {
          const items = await window.api?.workspace?.file?.list?.(
            workspacePath,
            entry.path
          );
          setChildren(items ?? []);
        } catch {
          setChildren([]);
        } finally {
          setLoading(false);
        }
      }
      setExpanded(true);
    }, [entry, workspacePath, expanded, children, onFileOpen]);

    return (
      <>
        <Box
          onClick={toggle}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            pl: `${depth * 16 + 8}px`,
            pr: "8px",
            height: ROW_HEIGHT,
            cursor: "pointer",
            "&:hover": {
              bgcolor: "rgba(255, 255, 255, 0.02)"
            },
            userSelect: "none",
            transition: "background-color 0.1s"
          }}
        >
          {entry.isDir ? (
            loading ? (
              <CircularProgress size={14} sx={{ color: "text.disabled" }} />
            ) : expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 18, color: "text.disabled" }} />
            ) : (
              <ChevronRightIcon
                sx={{ fontSize: 18, color: "text.disabled" }}
              />
            )
          ) : (
            <Box sx={{ width: 18, flexShrink: 0 }} />
          )}

          <Typography
            noWrap
            sx={{
              fontSize: "13px",
              fontFamily: EXPLORER_FONT,
              fontWeight: 400,
              color: entry.isDir ? "#c4a46c" : "text.secondary",
              flex: 1,
              lineHeight: 1
            }}
          >
            {entry.name}
          </Typography>

          {!entry.isDir && entry.size > 0 && (
            <Typography
              sx={{
                fontSize: "10px",
                color: "text.disabled",
                fontFamily: EXPLORER_FONT,
                flexShrink: 0,
                lineHeight: 1,
                opacity: 0.7
              }}
            >
              {formatSize(entry.size)}
            </Typography>
          )}
        </Box>

        {entry.isDir && (
          <Collapse in={expanded} unmountOnExit>
            {children?.map((child) => (
              <FileTreeItem
                key={child.path}
                entry={child}
                workspacePath={workspacePath}
                depth={depth + 1}
                onFileOpen={onFileOpen}
              />
            ))}
            {children?.length === 0 && (
              <Typography
                sx={{
                  pl: `${(depth + 1) * 16 + 30}px`,
                  py: "2px",
                  display: "block",
                  color: "text.disabled",
                  fontSize: "11px",
                  fontFamily: EXPLORER_FONT,
                  fontStyle: "italic",
                  height: ROW_HEIGHT,
                  lineHeight: `${ROW_HEIGHT}px`
                }}
              >
                empty
              </Typography>
            )}
          </Collapse>
        )}
      </>
    );
  }
);

FileTreeItem.displayName = "FileTreeItem";

interface VibeCodingFileExplorerProps {
  workspacePath: string | undefined;
  onFileOpen?: (filePath: string) => void;
}

const VibeCodingFileExplorer: React.FC<VibeCodingFileExplorerProps> = ({
  workspacePath,
  onFileOpen
}) => {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoot = useCallback(async () => {
    if (!workspacePath || !window.api?.workspace?.file?.list) {
      setEntries(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await window.api.workspace.file.list(workspacePath, ".");
      setEntries(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  if (!workspacePath) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%"
        }}
      >
        <Typography
          sx={{ fontSize: "13px", fontFamily: EXPLORER_FONT, color: "text.disabled" }}
        >
          Select a workspace
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: "12px",
          minHeight: 32,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Typography
          sx={{
            fontSize: "10px",
            fontFamily: EXPLORER_FONT,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "text.disabled"
          }}
        >
          Explorer
        </Typography>
        <Tooltip title="Refresh file tree">
          <span>
            <IconButton
              size="small"
              onClick={loadRoot}
              disabled={loading}
              sx={{ p: "4px" }}
            >
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Tree */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          py: "4px",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "#535353",
            borderRadius: 0
          },
          "&::-webkit-scrollbar-track": { background: "transparent" }
        }}
      >
        {loading && entries === null && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={18} sx={{ color: "text.disabled" }} />
          </Box>
        )}
        {error && (
          <Typography
            sx={{
              display: "block",
              px: "12px",
              py: "8px",
              color: "error.main",
              fontSize: "0.75rem"
            }}
          >
            {error}
          </Typography>
        )}
        {entries?.map((entry) => (
          <FileTreeItem
            key={entry.path}
            entry={entry}
            workspacePath={workspacePath}
            depth={0}
            onFileOpen={onFileOpen}
          />
        ))}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingFileExplorer);
