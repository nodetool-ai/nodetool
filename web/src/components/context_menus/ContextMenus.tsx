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

const ContextMenus = memo(function ContextMenus() {
    const { openMenuType } = useContextMenu();

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
        </>
    );
});

export default ContextMenus;
