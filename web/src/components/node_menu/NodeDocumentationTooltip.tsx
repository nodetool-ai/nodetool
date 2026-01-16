/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState, useEffect } from "react";
import { Box, Typography, Divider } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import { IconForType } from "../../config/data_types";
import { useFloating, useInteractions, useHover, offset, flip, shift } from "@floating-ui/react";

const tooltipStyles = (theme: Theme) =>
  css({
    "&": {
      maxWidth: "400px",
      padding: "16px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
      zIndex: 30000,
      pointerEvents: "none",
      animation: "fadeInTooltip 0.15s ease-out forwards"
    },
    "@keyframes fadeInTooltip": {
      "0%": { opacity: 0, transform: "translateY(4px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    }
  });

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "12px"
});

const titleStyles = css({
  fontWeight: 600,
  fontSize: "15px",
  lineHeight: 1.3
});

const descriptionStyles = css({
  fontSize: "13px",
  lineHeight: 1.5,
  color: "text.secondary",
  marginBottom: "12px"
});

const sectionTitleStyles = css({
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "text.secondary",
  marginBottom: "8px",
  marginTop: "12px"
});

const ioContainerStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px"
});

const ioItemStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "12px"
});

const shortcutStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid",
  borderColor: "divider"
});

const kbdStyles = css({
  display: "inline-block",
  padding: "2px 6px",
  fontSize: "11px",
  fontFamily: "monospace",
  backgroundColor: "rgba(0, 0, 0, 0.06)",
  border: "1px solid rgba(0, 0, 0, 0.12)",
  borderRadius: "4px",
  color: "text.secondary"
});

interface NodeDocumentationTooltipProps {
  node: NodeMetadata | null;
  anchorElement?: HTMLElement | null;
  onClose?: () => void;
}

const NodeDocumentationTooltip = memo(function NodeDocumentationTooltip({
  node,
  anchorElement,
  onClose
}: NodeDocumentationTooltipProps) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tooltipStyles(theme), [theme]);
  const [isVisible, setIsVisible] = useState(false);

  const { x, y, strategy, refs, context } = useFloating({
    open: isVisible && node !== null,
    onOpenChange: (open) => {
      setIsVisible(open);
      if (!open) {
        onClose?.();
      }
    },
    middleware: [
      offset(12),
      flip({
        fallbackPlacements: ["right-start", "left-start", "top-start", "bottom-start"]
      }),
      shift({ padding: 8 })
    ],
    placement: "right-start"
  });

  const hover = useHover(context, {
    delay: { open: 300, close: 100 },
    restMs: 100
  });

  const { getFloatingProps } = useInteractions([hover]);

  useEffect(() => {
    if (anchorElement && node) {
      refs.setReference(anchorElement);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [anchorElement, node, refs]);

  if (!node) {
    return null;
  }

  const formatType = (type: string): string => {
    if (!type) { return "Any"; }
    const parts = type.split(".");
    return parts[parts.length - 1];
  };

  const renderIO = (
    items: Array<{ name: string; type: { type: string } }>,
    title: string
  ) => {
    if (items.length === 0) { return null; }

    return (
      <>
        <Typography variant="caption" css={sectionTitleStyles}>
          {title}
        </Typography>
        <Box css={ioContainerStyles}>
          {items.map((item, index) => (
            <Box key={index} css={ioItemStyles}>
              <IconForType
                iconName={item.type.type}
                containerStyle={{
                  borderRadius: "2px",
                  marginLeft: "0",
                  marginTop: "0"
                }}
                bgStyle={{
                  backgroundColor: theme.vars.palette.grey[800],
                  margin: "0",
                  padding: "1px",
                  borderRadius: "2px",
                  boxShadow: "none",
                  width: "16px",
                  height: "16px"
                }}
                svgProps={{
                  width: "12px",
                  height: "12px"
                }}
              />
              <Typography
                component="span"
                sx={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "text.secondary"
                }}
              >
                {item.name}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: "11px",
                  color: "text.disabled"
                }}
              >
                : {formatType(item.type.type)}
              </Typography>
            </Box>
          ))}
        </Box>
      </>
    );
  };

  return (
    <Box
      ref={refs.setFloating}
      css={memoizedStyles}
      style={{
        position: strategy,
        left: x ?? 0,
        top: y ?? 0,
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? "visible" : "hidden"
      }}
      {...getFloatingProps()}
    >
      <Box css={headerStyles}>
        <IconForType
          iconName={node.outputs.length > 0 ? node.outputs[0].type.type : ""}
          containerStyle={{
            borderRadius: "4px",
            marginLeft: "0",
            marginTop: "0"
          }}
          bgStyle={{
            backgroundColor: theme.vars.palette.primary.main,
            margin: "0",
            padding: "4px",
            borderRadius: "4px",
            boxShadow: "none",
            width: "32px",
            height: "32px"
          }}
          svgProps={{
            width: "20px",
            height: "20px",
            color: theme.vars.palette.primary.contrastText
          }}
        />
        <Box>
          <Typography variant="body1" css={titleStyles}>
            {node.title}
          </Typography>
          {node.namespace && (
            <Typography
              variant="caption"
              sx={{
                fontSize: "11px",
                color: "text.disabled"
              }}
            >
              {node.namespace}
            </Typography>
          )}
        </Box>
      </Box>

      {node.description && (
        <Typography variant="body2" css={descriptionStyles}>
          {node.description}
        </Typography>
      )}

      <Divider sx={{ my: 1, borderColor: "divider" }} />

      {renderIO(node.properties || [], "Inputs")}
      {renderIO(node.outputs || [], "Outputs")}

      <Box css={shortcutStyles}>
        <Typography
          variant="caption"
          sx={{
            fontSize: "11px",
            color: "text.disabled",
            marginRight: "8px"
          }}
        >
          Press
        </Typography>
        <Box component="span" css={kbdStyles}>↑</Box>
        <Box component="span" css={kbdStyles}>↓</Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: "11px",
            color: "text.disabled",
            marginLeft: "4px",
            marginRight: "8px"
          }}
        >
          to navigate,
        </Typography>
        <Box component="span" css={kbdStyles}>↵</Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: "11px",
            color: "text.disabled",
            marginLeft: "4px"
          }}
        >
          to select
        </Typography>
      </Box>
    </Box>
  );
});

export default NodeDocumentationTooltip;
