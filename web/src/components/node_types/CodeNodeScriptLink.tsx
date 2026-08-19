/**
 * The Code node's script-link header.
 *
 * Unlinked, it offers the ways into a script: pick one, lift this node's body
 * into a new one, or save that new script straight into the node menu. Linked,
 * it says what is pinned and offers the two ways out — re-pin to the script's
 * current content, or keep the body inline and drop the link — plus adding the
 * linked script to the node menu. The editor for the script itself is its own
 * tab; nothing here edits a document.
 */
import { memo, useCallback, useState } from "react";

import { useJsScripts } from "../../hooks/jsScript/useJsScripts";
import { useCodeNodeScriptLink } from "../../hooks/nodes/useCodeNodeScriptLink";
import type { NodeData } from "../../stores/NodeData";
import { notifyMutationError } from "../../utils/notifyMutationError";
import { EditorButton, NodeSelect, NodeMenuItem } from "../editor_ui";
import { Box, Caption, FlexRow, GAP, SPACING } from "../ui_primitives";
import SaveToMyNodesDialog from "./SaveToMyNodesDialog";
import { isCustomCodeNode } from "../node/codeNodeUi";

interface CodeNodeScriptLinkProps {
  id: string;
  data: NodeData;
  nodeType: string;
}

const NEW_SCRIPT_NAME = "Extracted from a Code node";
const DEFAULT_CATEGORY = "My Nodes";

// EditorButton pins its height, so a label that wraps spills over the toolbar
// below it. The row wraps instead; each button stays one line.
const BUTTON_SX = { whiteSpace: "nowrap", flex: "0 0 auto" } as const;

const CodeNodeScriptLinkInner: React.FC<CodeNodeScriptLinkProps> = ({
  id,
  data,
  nodeType
}) => {
  const {
    link,
    linkedName,
    linkScript,
    updateToLatest,
    extractToScript,
    addToPalette,
    detach
  } = useCodeNodeScriptLink(id, data);
  const scripts = useJsScripts();
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const guard = useCallback(
    async <T,>(label: string, action: () => Promise<T>) => {
      setBusy(true);
      try {
        await action();
      } catch (error) {
        notifyMutationError(label, error);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const onPick = useCallback(
    (scriptId: string) => {
      if (!scriptId) return;
      void guard("link the script", () => linkScript(scriptId));
    },
    [guard, linkScript]
  );

  const saveDialog = (
    <SaveToMyNodesDialog
      open={saveOpen}
      initialName={link ? undefined : data.title || NEW_SCRIPT_NAME}
      initialCategory={DEFAULT_CATEGORY}
      busy={busy}
      onCancel={() => setSaveOpen(false)}
      onConfirm={({ name, category }) => {
        setSaveOpen(false);
        void guard("save the node", async () => {
          if (link) {
            await addToPalette(category);
          } else {
            await extractToScript(name, category);
          }
        });
      }}
    />
  );

  if (link) {
    return (
      <FlexRow
        align="center"
        justify="space-between"
        gap={GAP.tight}
        wrap
        sx={{ px: SPACING.xs }}
      >
        <Caption
          sx={{
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={`${linkedName ?? link.id} v${link.version}`}
        >
          {`${isCustomCodeNode(nodeType, data) ? "My node" : "Linked to"} ${
            linkedName ?? link.id
          } v${link.version}`}
        </Caption>
        <FlexRow gap={GAP.tight} wrap justify="flex-end">
          <EditorButton
            density="compact"
            disabled={busy}
            sx={BUTTON_SX}
            title="Re-pin this node to the script's current content"
            onClick={() => void guard("re-pin the script", updateToLatest)}
          >
            Update
          </EditorButton>
          <EditorButton
            density="compact"
            disabled={busy}
            sx={BUTTON_SX}
            onClick={() => setSaveOpen(true)}
          >
            Add to My Nodes
          </EditorButton>
          <EditorButton
            density="compact"
            disabled={busy}
            sx={BUTTON_SX}
            onClick={detach}
          >
            Detach
          </EditorButton>
        </FlexRow>
        {saveDialog}
      </FlexRow>
    );
  }

  return (
    <FlexRow align="center" gap={GAP.tight} wrap sx={{ px: SPACING.xs }}>
      {/* NodeSelect is fullWidth, so it needs a bounded box of its own —
          otherwise it eats the row and pushes the buttons out of the node. */}
      <Box sx={{ flex: "1 1 96px", minWidth: 96, maxWidth: 160 }}>
        <NodeSelect
          density="compact"
          displayEmpty
          value=""
          disabled={busy}
          onChange={(event) => onPick(String(event.target.value ?? ""))}
          renderValue={() => "Link script"}
          aria-label="Link script"
        >
          {(scripts.data ?? []).map((script) => (
            <NodeMenuItem key={script.id} value={script.id}>
              {script.name}
            </NodeMenuItem>
          ))}
        </NodeSelect>
      </Box>
      <EditorButton
        density="compact"
        disabled={busy}
        sx={BUTTON_SX}
        title="Lift this node's body into a new script"
        onClick={() =>
          void guard("extract the script", () => extractToScript(NEW_SCRIPT_NAME))
        }
      >
        Extract
      </EditorButton>
      <EditorButton
        density="compact"
        disabled={busy}
        sx={BUTTON_SX}
        onClick={() => setSaveOpen(true)}
      >
        Save to My Nodes
      </EditorButton>
      {saveDialog}
    </FlexRow>
  );
};

export const CodeNodeScriptLink = memo(CodeNodeScriptLinkInner);
CodeNodeScriptLink.displayName = "CodeNodeScriptLink";

export default CodeNodeScriptLink;
