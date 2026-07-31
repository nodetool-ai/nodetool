/**
 * Hosts the "Write code with AI" dialog for the entry points that have no node
 * of their own to render it from — the palette entry and the two handle
 * context menus.
 *
 * The dialog is keyed to an existing node, so those entry points create one up
 * front. This host owns the other half of that deal: if the dialog closes
 * without a submission having been applied, the node and edges it created are
 * removed and any edge that stepped aside is put back.
 */
import { memo, useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useNodes } from "../../contexts/NodeContext";
import useCodeGenDialogStore from "../../stores/CodeGenDialogStore";
import { isCodeGenApplied } from "../../utils/codeGenEntryPoints";
import CodeGenDialog from "../node_types/code_gen/CodeGenDialog";

const CodeGenDialogHostInner = () => {
  const request = useCodeGenDialogStore((state) => state.request);
  const closeCodeGenDialog = useCodeGenDialogStore(
    (state) => state.closeCodeGenDialog
  );
  const { findNode, deleteNodes, deleteEdges, addEdge } = useNodes(
    (state) => ({
      findNode: state.findNode,
      deleteNodes: state.deleteNodes,
      deleteEdges: state.deleteEdges,
      addEdge: state.addEdge
    }),
    shallow
  );

  const handleClose = useCallback(() => {
    const discard = request?.discard;
    const node = request ? findNode(request.nodeId) : undefined;
    if (discard && node && !isCodeGenApplied(node)) {
      if (discard.edgeIds.length > 0) {
        deleteEdges([...discard.edgeIds]);
      }
      if (discard.nodeIds.length > 0) {
        deleteNodes([...discard.nodeIds]);
      }
      for (const edge of discard.restoreEdges) {
        addEdge(edge);
      }
    }
    closeCodeGenDialog();
  }, [addEdge, closeCodeGenDialog, deleteEdges, deleteNodes, findNode, request]);

  if (!request) {
    return null;
  }

  return (
    <CodeGenDialog
      open
      nodeId={request.nodeId}
      onClose={handleClose}
      inputs={request.inputs}
      expectedOutput={request.expectedOutput}
    />
  );
};

export const CodeGenDialogHost = memo(CodeGenDialogHostInner);
CodeGenDialogHost.displayName = "CodeGenDialogHost";

export default CodeGenDialogHost;
