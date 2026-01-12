import { memo } from "react";
import useContextMenu from "../../stores/ContextMenuStore";
import NodeContextMenu from "./NodeContextMenu";
import PaneContextMenu from "./PaneContextMenu";
import SelectionContextMenu from "./SelectionContextMenu";
import PropertyContextMenu from "./PropertyContextMenu";
import OutputContextMenu from "./OutputContextMenu";
import InputContextMenu from "./InputContextMenu";
import EdgeContextMenu from "./EdgeContextMenu";
import ConnectionMatchMenu from "./ConnectionMatchMenu";
import WorkflowContextMenu from "./WorkflowContextMenu";
import AnnotationDialog from "../dialogs/AnnotationDialog";
import useAnnotationDialogStore from "../../stores/AnnotationDialogStore";
import { useNodes } from "../../contexts/NodeContext";

const ContextMenus = memo(function ContextMenus() {
  const { openMenuType } = useContextMenu();

  const annotationDialogState = useAnnotationDialogStore.getState();
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const handleSaveAnnotation = (annotation: string) => {
    if (annotationDialogState.nodeId) {
      updateNodeData(annotationDialogState.nodeId, { annotation });
    }
  };

  return (
    <>
      {openMenuType === "node-context-menu" && <NodeContextMenu />}
      {openMenuType === "pane-context-menu" && <PaneContextMenu />}
      {openMenuType === "property-context-menu" && <PropertyContextMenu />}
      {openMenuType === "selection-context-menu" && <SelectionContextMenu />}
      {openMenuType === "output-context-menu" && <OutputContextMenu />}
      {openMenuType === "input-context-menu" && <InputContextMenu />}
      {openMenuType === "edge-context-menu" && <EdgeContextMenu />}
      {openMenuType === "connection-match-menu" && <ConnectionMatchMenu />}
      {openMenuType === "workflow-context-menu" && <WorkflowContextMenu />}
      <AnnotationDialog
        open={annotationDialogState.isOpen}
        onClose={annotationDialogState.closeAnnotationDialog}
        onSave={handleSaveAnnotation}
        initialAnnotation={annotationDialogState.initialAnnotation}
        nodeTitle={annotationDialogState.nodeTitle}
      />
    </>
  );
});

export default ContextMenus;
