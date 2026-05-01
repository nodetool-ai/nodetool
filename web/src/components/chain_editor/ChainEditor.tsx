/** @jsxImportSource @emotion/react */
/**
 * Main chain-based graph editor for web.
 * Renders a vertical scrollable list of chain node cards
 * with connectors and add-node buttons.
 */

import React, { useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, IconButton, TextField } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { EmptyState } from "../ui_primitives/EmptyState";
import { Tooltip } from "../ui_primitives";
import { useChainEditorStore } from "./useChainEditorStore";
import { ChainNodeCard } from "./ChainNodeCard";
import { ChainConnector } from "./ChainConnector";
import { AddNodeButton } from "./AddNodeButton";
import { NodePickerDialog } from "./NodePickerDialog";
import { trpcClient } from "../../trpc/client";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { ChainNode, InputSource } from "./chainTypes";

interface ChainEditorProps {
  onSave?: () => void;
}

export const ChainEditor: React.FC<ChainEditorProps> = ({ onSave }) => {
  const theme = useTheme();
  const [saving, setSaving] = useState(false);

  const chain = useChainEditorStore((s) => s.chain);
  const workflowName = useChainEditorStore((s) => s.workflowName);
  const nodePickerVisible = useChainEditorStore((s) => s.nodePickerVisible);
  const insertAtIndex = useChainEditorStore((s) => s.insertAtIndex);
  const addNode = useChainEditorStore((s) => s.addNode);
  const removeNode = useChainEditorStore((s) => s.removeNode);
  const moveNode = useChainEditorStore((s) => s.moveNode);
  const duplicateNode = useChainEditorStore((s) => s.duplicateNode);
  const updateProperty = useChainEditorStore((s) => s.updateProperty);
  const setSelectedOutput = useChainEditorStore((s) => s.setSelectedOutput);
  const setInputMapping = useChainEditorStore((s) => s.setInputMapping);
  const toggleExpanded = useChainEditorStore((s) => s.toggleExpanded);
  const showNodePicker = useChainEditorStore((s) => s.showNodePicker);
  const hideNodePicker = useChainEditorStore((s) => s.hideNodePicker);
  const setWorkflowName = useChainEditorStore((s) => s.setWorkflowName);
  const workflowId = useChainEditorStore((s) => s.workflowId);
  const toWorkflowGraph = useChainEditorStore((s) => s.toWorkflowGraph);

  const handleSave = useCallback(async () => {
    if (onSave) {
      onSave();
      return;
    }
    setSaving(true);
    try {
      const graph = toWorkflowGraph();
      if (workflowId) {
        await trpcClient.workflows.update.mutate({
          id: workflowId,
          name: workflowName,
          access: "private",
          graph: graph as never
        });
      } else {
        await trpcClient.workflows.create.mutate({
          name: workflowName,
          access: "private",
          graph: graph as never
        });
      }
    } finally {
      setSaving(false);
    }
  }, [onSave, toWorkflowGraph, workflowId, workflowName]);

  const handleAddNode = useCallback(
    (metadata: NodeMetadata) => {
      const idx = insertAtIndex === -1 ? undefined : insertAtIndex;
      addNode(metadata, idx);
      hideNodePicker();
    },
    [addNode, hideNodePicker, insertAtIndex]
  );

  const previousNodesByIndex = useMemo((): Array<ChainNode[]> => {
    return chain.map((_node, i) => chain.slice(0, i));
  }, [chain]);

  return (
    <FlexColumn fullHeight fullWidth sx={{ backgroundColor: theme.vars.palette.background.default }}>
      {/* Toolbar */}
      <FlexRow
        gap={1.5}
        align="center"
        padding={1.5}
        sx={{
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
          flexShrink: 0,
        }}
      >
        <TextField
          size="small"
          variant="standard"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          placeholder="Workflow name"
          slotProps={{ input: { disableUnderline: true, sx: { fontWeight: 600, fontSize: theme.fontSizeNormal } } }}
          sx={{ flex: 1 }}
        />
        <Tooltip title="Save workflow">
          <IconButton
            size="small"
            aria-label="Save workflow"
            onClick={handleSave}
            disabled={saving}
            sx={{ color: theme.vars.palette.text.secondary }}
          >
            <SaveOutlinedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </FlexRow>

      {/* Chain content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: { xs: 1.5, sm: 2 },
          py: 1,
          maxWidth: 600,
          width: "100%",
          mx: "auto",
        }}
      >
        {chain.length === 0 ? (
          <FlexColumn align="center" justify="center" sx={{ pt: 12 }}>
            <EmptyState
              icon={<AccountTreeOutlinedIcon sx={{ fontSize: 48 }} />}
              title="Build Your Workflow"
              description={
                "Add nodes to create a processing chain.\nEach node's output flows into the next."
              }
            />
            <AddNodeButton isHero onClick={() => showNodePicker(0)} />
          </FlexColumn>
        ) : (
          <FlexColumn align="stretch">
            {chain.map((node, index) => (
              <React.Fragment key={node.id}>
                {index === 0 && (
                  <AddNodeButton onClick={() => showNodePicker(0)} />
                )}
                {index > 0 && (
                  <>
                    <AddNodeButton onClick={() => showNodePicker(index)} />
                    <ChainConnector
                      sourceOutput={chain[index - 1].selectedOutput}
                      targetInput={Object.keys(node.inputMappings)[0] ?? null}
                    />
                  </>
                )}
                <ChainNodeCard
                  node={node}
                  index={index}
                  totalNodes={chain.length}
                  workflowId={workflowId}
                  previousNodes={previousNodesByIndex[index]}
                  onToggleExpanded={() => toggleExpanded(node.id)}
                  onUpdateProperty={(name, value) => updateProperty(node.id, name, value)}
                  onSetOutput={(out) => setSelectedOutput(node.id, out)}
                  onSetInputMapping={(inputName, source) => setInputMapping(node.id, inputName, source)}
                  onRemove={() => removeNode(node.id)}
                  onDuplicate={() => duplicateNode(node.id)}
                  onMoveUp={() => moveNode(index, index - 1)}
                  onMoveDown={() => moveNode(index, index + 1)}
                />
              </React.Fragment>
            ))}
            <AddNodeButton onClick={() => showNodePicker(-1)} />
            <Box sx={{ height: 120 }} />
          </FlexColumn>
        )}
      </Box>

      <NodePickerDialog
        open={nodePickerVisible}
        onSelect={handleAddNode}
        onClose={hideNodePicker}
      />
    </FlexColumn>
  );
};

export default ChainEditor;
