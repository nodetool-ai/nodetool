/**
 * PreviewPane Component
 *
 * Live preview of the generated HTML with device frame simulation.
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Button
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import TabletIcon from "@mui/icons-material/Tablet";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import CodeIcon from "@mui/icons-material/Code";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";

/**
 * Device frame dimensions
 */
const deviceDimensions = {
  desktop: { width: "100%", height: "100%" },
  tablet: { width: "768px", height: "1024px" },
  mobile: { width: "375px", height: "667px" }
};

/**
 * Props for PreviewPane
 */
interface PreviewPaneProps {
  /** Property values for resolving bindings */
  propertyValues?: Record<string, unknown>;
  /** Called when breakpoint changes */
  onBreakpointChange?: (breakpoint: "desktop" | "tablet" | "mobile") => void;
}

/**
 * PreviewPane component
 */
export const PreviewPane: React.FC<PreviewPaneProps> = ({
  propertyValues = {},
  onBreakpointChange
}) => {
  const theme = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  // Get state and actions from store
  const generateHTML = useHTMLBuilderStore((state) => state.generateHTML);
  const currentBreakpoint = useHTMLBuilderStore(
    (state) => state.currentBreakpoint
  );
  const setCurrentBreakpoint = useHTMLBuilderStore(
    (state) => state.setCurrentBreakpoint
  );

  // Generate HTML with current property values
  const html = useMemo(() => {
    return generateHTML(propertyValues);
  }, [generateHTML, propertyValues]);

  // Update iframe content
  useEffect(() => {
    if (iframeRef.current && viewMode === "preview") {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html, viewMode]);

  // Handle breakpoint change
  const handleBreakpointChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newBreakpoint: "desktop" | "tablet" | "mobile" | null) => {
      if (newBreakpoint) {
        setCurrentBreakpoint(newBreakpoint);
        onBreakpointChange?.(newBreakpoint);
      }
    },
    [setCurrentBreakpoint, onBreakpointChange]
  );

  // Handle view mode toggle
  const handleViewModeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newMode: "preview" | "code" | null) => {
      if (newMode) {
        setViewMode(newMode);
      }
    },
    []
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  // Handle open in new window
  const handleOpenInNewWindow = useCallback(() => {
    const newWindow = window.open("", "_blank");
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
    }
  }, [html]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy HTML:", err);
    }
  }, [html]);

  // Get current device dimensions
  const dimensions = deviceDimensions[currentBreakpoint];

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        {/* View mode toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          size="small"
        >
          <ToggleButton value="preview" aria-label="Preview">
            <Tooltip title="Preview">
              <VisibilityIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="code" aria-label="Code">
            <Tooltip title="HTML Code">
              <CodeIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        {/* Device selector */}
        {viewMode === "preview" && (
          <ToggleButtonGroup
            value={currentBreakpoint}
            exclusive
            onChange={handleBreakpointChange}
            size="small"
          >
            <ToggleButton value="desktop" aria-label="Desktop">
              <Tooltip title="Desktop">
                <DesktopWindowsIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="tablet" aria-label="Tablet">
              <Tooltip title="Tablet">
                <TabletIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="mobile" aria-label="Mobile">
              <Tooltip title="Mobile">
                <PhoneAndroidIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        {/* Actions */}
        {viewMode === "preview" ? (
          <>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={handleRefresh}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Open in new window">
              <IconButton size="small" onClick={handleOpenInNewWindow}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title={copied ? "Copied!" : "Copy HTML"}>
            <Button
              size="small"
              startIcon={<ContentCopyIcon fontSize="small" />}
              onClick={handleCopy}
              variant={copied ? "contained" : "outlined"}
              color={copied ? "success" : "primary"}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </Tooltip>
        )}
      </Box>

      {/* Preview content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          backgroundColor:
            currentBreakpoint !== "desktop"
              ? theme.vars.palette.grey[900]
              : "transparent"
        }}
      >
        {viewMode === "preview" ? (
          <Box
            sx={{
              width: dimensions.width,
              height: dimensions.height,
              maxWidth: "100%",
              maxHeight: "100%",
              backgroundColor: "#ffffff",
              borderRadius: currentBreakpoint !== "desktop" ? "12px" : 0,
              overflow: "hidden",
              boxShadow:
                currentBreakpoint !== "desktop"
                  ? "0 8px 32px rgba(0,0,0,0.3)"
                  : "none",
              border:
                currentBreakpoint !== "desktop"
                  ? `2px solid ${theme.vars.palette.grey[700]}`
                  : "none"
            }}
          >
            <iframe
              ref={iframeRef}
              title="HTML Preview"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block"
              }}
              sandbox="allow-scripts"
            />
          </Box>
        ) : (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              overflow: "auto"
            }}
          >
            <pre
              style={{
                margin: 0,
                padding: "16px",
                backgroundColor: theme.vars.palette.grey[900],
                color: theme.vars.palette.grey[100],
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: "13px",
                lineHeight: 1.5,
                borderRadius: "8px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}
            >
              {html}
            </pre>
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 0.5,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {html.length.toLocaleString()} characters
        </Typography>
        {viewMode === "preview" && (
          <Typography variant="caption" color="text.secondary">
            {currentBreakpoint === "desktop"
              ? "Desktop"
              : currentBreakpoint === "tablet"
                ? "768×1024"
                : "375×667"}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default PreviewPane;
