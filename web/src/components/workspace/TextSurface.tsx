/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";

import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import TextViewer from "../asset_viewer/TextViewer";
import LexicalPlugins from "../textEditor/LexicalEditor";
import EditorController from "../textEditor/EditorController";
import { codeHighlightTheme } from "../textEditor/codeHighlightTheme";

interface TextSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: theme.vars.palette.grey[800],
    ".editor-pane": {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "1.5em 2em",
      overflow: "auto",
      color: theme.vars.palette.text.primary,
      fontSize: theme.fontSizeSmall
    },
    ".error-container": {
      color: theme.vars.palette.error.main
    }
  });

// Mirror the Lexical setup used by TextEditorModal so the inline editor
// renders the same rich-text/code nodes and highlight theme.
const editorConfig = {
  namespace: "TextSurface",
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
    LinkNode
  ],
  theme: {
    text: {
      large: "font-size-large"
    },
    ...codeHighlightTheme
  }
};

// EditorController is a headless Lexical plugin whose command-callbacks are
// required but only matter when an external toolbar/find-replace drives them.
// This surface doesn't host that chrome yet, so the command wiring is no-op.
const noop = () => {};

/**
 * The text-document surface for a workspace tab. `refId` is a text Asset id.
 *
 * - view mode renders the read-only TextViewer (which fetches the asset text).
 * - edit mode mounts the inline Lexical editor seeded with the fetched text.
 *
 * Persistence: there is no save-to-text-asset API today (TextAssetDisplay
 * opens text assets read-only for the same reason). Edits stay in-memory.
 * TODO(text-asset-persistence): wire onChange back to an asset update once an
 * endpoint exists, then drop the in-memory-only caveat.
 */
const TextSurface = ({ refId, mode }: TextSurfaceProps) => {
  const theme = useTheme();
  const {
    data: asset,
    isLoading: assetLoading,
    error: assetError
  } = useAssetById(refId);

  const getUrl = asset?.get_url ?? undefined;
  const isEdit = mode === "edit";

  // The viewer fetches its own text from the asset; the editor needs the raw
  // string up front for `initialContent`, so fetch it only in edit mode.
  const {
    data: text,
    isLoading: textLoading,
    error: textError
  } = useQuery({
    queryKey: ["textAsset", refId],
    enabled: isEdit && !!getUrl,
    queryFn: async () => {
      if (!getUrl) {
        throw new Error("Text asset has no get_url");
      }
      const response = await fetch(getUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch text asset: ${response.status}`);
      }
      return response.text();
    }
  });

  const initialContent = useMemo(() => text ?? "", [text]);

  if (assetLoading || (isEdit && getUrl && textLoading)) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (assetError || !asset) {
    return (
      <FlexColumn
        className="error-container"
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <Text size="normal" weight={600}>
          Failed to load text asset
        </Text>
      </FlexColumn>
    );
  }

  if (!isEdit) {
    return <TextViewer asset={asset} />;
  }

  if (textError) {
    return (
      <FlexColumn
        className="error-container"
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <Text size="normal" weight={600}>
          Failed to load text content
        </Text>
      </FlexColumn>
    );
  }

  return (
    <div css={styles(theme)}>
      <LexicalComposer initialConfig={editorConfig}>
        <div className="editor-pane">
          <EditorController
            onCanUndoChange={noop}
            onCanRedoChange={noop}
            onTextChange={noop}
            onUndoCommand={noop}
            onRedoCommand={noop}
            onFindCommand={noop}
            onReplaceCommand={noop}
            onNavigateCommand={noop}
            onFormatCodeCommand={noop}
            onIsCodeBlockChange={noop}
            initialContent={initialContent}
          />
          <LexicalPlugins onChange={noop} />
        </div>
      </LexicalComposer>
    </div>
  );
};

export default TextSurface;
