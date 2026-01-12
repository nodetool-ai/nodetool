/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback, useRef, useMemo } from "react";
import { NodeProps, Node } from "@xyflow/react";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { Box, Typography } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodes } from "../../contexts/NodeContext";
import LexicalPlugins from "../textEditor/LexicalEditor";
import {
  $convertFromMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";
import type { EditorState } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    margin: 0,
    borderRadius: "8px",
    padding: theme.spacing(1.5),
    boxSizing: "border-box",
    position: "relative",
    backgroundColor: hexToRgba(theme.vars.palette.c_bg_workflow_doc || "#e3f2fd", 0.9),
    border: `2px solid ${theme.vars.palette.primary.main}`,
    "& .node-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      marginBottom: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "& .node-icon": {
        color: theme.vars.palette.primary.main
      },
      "& .node-title": {
        fontSize: theme.fontSizeSmall,
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }
    },
    "& .text-editor-container": {
      width: "100%",
      height: "100%",
      maxHeight: "fit-content",
      overflowX: "hidden",
      "& .editor-input": {
        height: "unset",
        paddingTop: ".5em",
        lineHeight: "1.1em",
        color: theme.vars.palette.text.primary
      }
    }
  });

const initialConfigTemplate = {
  namespace: "WorkflowDocNodeEditor",
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode
  ],
  theme: {
    text: {
      large: "font-size-large",
      bold: "editor-text-bold",
      italic: "editor-text-italic",
      underline: "editor-text-underline",
      strikethrough: "editor-text-strikethrough",
      code: "editor-text-code"
    },
    link: "editor-link",
    code: "editor-code",
    heading: {
      h1: "editor-heading-h1",
      h2: "editor-heading-h2",
      h3: "editor-heading-h3",
      h4: "editor-heading-h4",
      h5: "editor-heading-h5",
      h6: "editor-heading-h6"
    },
    list: {
      ul: "editor-list-ul",
      ol: "editor-list-ol",
      listitem: "editor-listitem"
    },
    quote: "editor-quote"
  }
};

const WorkflowDocNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode
  }));
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<EditorState | null>(null);
  const [isEditorFocused, setIsEditorFocused] = useState(false);

  const docContent = props.data.properties.workflow_doc || "";

  const editorConfig = useMemo(() => {
    const config: any = {
      ...initialConfigTemplate
    };

    if (typeof docContent === "string" && docContent.length > 0) {
      config.editorState = (_editor: any) => {
        $convertFromMarkdownString(docContent, TRANSFORMERS);
      };
    } else if (
      docContent &&
      typeof docContent === "object" &&
      docContent.root &&
      Object.keys(docContent).length > 0
    ) {
      config.editorState = JSON.stringify(docContent);
    }

    return config;
  }, [docContent]);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newEditorState: EditorState) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            workflow_doc: newEditorState.toJSON()
          }
        });
      }, 500),
    [props.id, props.data, updateNodeData]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (!contentOnFocusRef.current) {
        contentOnFocusRef.current = editorState;
      }
      debouncedUpdate(editorState);
    },
    [debouncedUpdate]
  );

  const handleScaleToFit = useCallback(() => {
    if (editorRef.current && containerRef.current) {
      const editorDiv = editorRef.current.querySelector(
        ".editor-input"
      ) as HTMLDivElement;
      if (!editorDiv) {
        return;
      }

      const containerDiv = containerRef.current;

      const MIN_WIDTH = 150;
      const MAX_WIDTH = 600;
      const bufferX = 20;

      const newWidth = editorDiv.scrollWidth + bufferX;
      const finalWidth = Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH);

      const currentDOMWidth = containerDiv.offsetWidth;
      const widthNeedsUpdate = Math.abs(currentDOMWidth - finalWidth) > 1;

      if (widthNeedsUpdate) {
        updateNode(props.id, {
          width: finalWidth,
          height: containerDiv.offsetHeight
        });
      }

      requestAnimationFrame(() => {
        const contentHeight = editorDiv.scrollHeight;
        const paddingTop =
          parseFloat(getComputedStyle(containerDiv).paddingTop) || 0;
        const paddingBottom =
          parseFloat(getComputedStyle(containerDiv).paddingBottom) || 0;
        const bufferY = 2;
        const newHeight = contentHeight + paddingTop + paddingBottom + bufferY;
        const MIN_HEIGHT = 60;
        const finalHeight = Math.max(newHeight, MIN_HEIGHT);

        const currentDOMHeight = containerDiv.offsetHeight;
        const heightNeedsUpdate = Math.abs(currentDOMHeight - finalHeight) > 1;

        if (heightNeedsUpdate || widthNeedsUpdate) {
          updateNode(props.id, {
            width: finalWidth,
            height: finalHeight,
            data: {
              ...props.data,
              size: { width: finalWidth, height: finalHeight }
            }
          });
        }
      });
    }
  }, [props.id, props.data, updateNode]);

  const handleBlur = useCallback(
    (latestEditorState: EditorState) => {
      if (
        contentOnFocusRef.current &&
        !isEqual(contentOnFocusRef.current.toJSON(), latestEditorState.toJSON())
      ) {
        handleScaleToFit();
      }
      contentOnFocusRef.current = null;
    },
    [handleScaleToFit]
  );

  return (
    <Box
      ref={containerRef}
      className={`workflow-doc-node node-drag-handle ${
        props.selected ? "selected" : ""
      } ${isEditorFocused ? "focused" : ""}`.trim()}
      css={styles(theme)}
    >
      <Box className="node-header">
        <Typography className="node-title">Workflow Documentation</Typography>
      </Box>
      <div ref={editorRef} className="text-editor-container">
        <LexicalComposer initialConfig={editorConfig}>
          <LexicalPlugins
            onChange={handleEditorChange}
            onBlur={handleBlur}
            onFocusChange={setIsEditorFocused}
          />
        </LexicalComposer>
      </div>
    </Box>
  );
};

export default memo(WorkflowDocNode, isEqual);
